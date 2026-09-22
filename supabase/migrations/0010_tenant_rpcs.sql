-- Phase 2 / Unit 2, the HARD GATE. New tenant-scoped RPCs replacing the
-- global-pool RPCs from 0001_init.sql/0004_admin_panel.sql, under new names
-- (design D2/Migration step 4 -- old RPCs keep serving traffic until
-- 0014_drop_legacy_rpcs.sql, after the app has fully cut over).
--
-- Every RPC below takes p_organization_id (admin RPCs) and/or p_raffle_id
-- (RPCs touching the numeros table directly) and narrows every predicate
-- accordingly -- see design D2 for the exact collision this closes for
-- editar_numero_rifa/reasignar_numeros_rifa once numeros' PK became
-- (raffle_id, numero) in 0009_tenant_constraints.sql.
--
-- rechazar_reserva_rifa is not in the tasks artifact's literal 0010 RPC
-- list, but the spec's reservation-flow domain explicitly requires EVERY
-- admin reservation RPC to be tenant-scoped (it names confirmar_pago_admin,
-- rechazar_reserva_admin, editar_numero_admin, reasignar_numeros_admin
-- together), and app/admin/actions.ts (task 2.12) has no tenant-scoped
-- target to call for its rechazarReserva action without it. Added here to
-- close that gap -- see this batch's apply-progress "Deviations" section.

-- ---------------------------------------------------------------------------
-- crear_organizacion: onboarding entry point. Creates the organizations row
-- AND its owner organization_members row atomically. Takes NO
-- client-suppliable organization_id anywhere in its signature -- the new
-- org's id is generated inside the function. Identifies the caller via
-- auth.uid(), so it must run with the caller's own JWT (authenticated role),
-- never via the service-role client, unlike every other RPC in this file.
-- ---------------------------------------------------------------------------
create or replace function crear_organizacion(p_nombre text, p_subdomain text)
returns table(organization_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org_id uuid;
  v_subdomain text;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  v_subdomain := lower(trim(p_subdomain));

  if v_subdomain is null or length(v_subdomain) = 0 then
    raise exception 'Subdomain requerido';
  end if;

  -- DNS-label charset/length allowlist: lowercase letters, digits, and
  -- internal hyphens only, no leading/trailing hyphen, 1-63 chars -- matches
  -- the label shape lib/tenant/subdomain.ts's parseSubdomain()/classifyLabel()
  -- assumes when it splits a Host header on ".". Rejects dots, unicode
  -- homoglyphs, whitespace, etc. that isReservedSubdomain()'s blocklist alone
  -- would let through.
  if v_subdomain !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception 'Subdomain inválido';
  end if;

  -- keep in sync with isReservedSubdomain() in lib/tenant/subdomain.ts
  if v_subdomain = any(array['www', 'admin', 'app', 'api', 'auth', 'static']) then
    raise exception 'Subdomain reservado';
  end if;

  insert into organizations (nombre, subdomain, is_platform_owner, subscription_status, trial_ends_at)
  values (p_nombre, v_subdomain, false, 'trialing', now() + interval '14 days')
  returning id into v_org_id;

  insert into organization_members (organization_id, user_id, role)
  values (v_org_id, auth.uid(), 'owner');

  return query select v_org_id;
end;
$$;

revoke execute on function crear_organizacion(text, text) from public, anon;
grant execute on function crear_organizacion(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- crear_rifa: creates a raffle for an existing org and seeds its numeros
-- pool. The one_open_raffle partial unique index (0006, D5) blocks a second
-- open raffle for the same org by constraint, not by an app-level check.
-- Admin-only (called via the service-role client with organization_id from
-- AdminContext), like every RPC below except crear_organizacion.
--
-- Perf note: the bulk seed insert below already writes p_organization_id
-- directly into every row's organization_id (not derived from raffle_id),
-- so it does no per-row lookup of its own. The
-- numeros_organization_id_consistency BEFORE INSERT ROW trigger still runs
-- its own `select organization_id from raffles where id = new.raffle_id`
-- once per inserted row regardless (up to 100,001 rows here) -- that's a
-- known, deliberate N+1 on a primary-key lookup (cheap per-row, not free at
-- this volume) kept as defense-in-depth so the consistency check can't be
-- bypassed by a future INSERT path that doesn't derive organization_id
-- correctly. Turning it into a single set-based check would require
-- rewriting it as a statement-level trigger (not supported for BEFORE ROW
-- semantics that need to reject individual rows) or caching the lookup
-- across rows in the same statement -- deferred as out of scope for this
-- batch; revisit if raffle seeding volume or latency becomes a real problem.
-- ---------------------------------------------------------------------------
create or replace function crear_rifa(
  p_organization_id uuid,
  p_nombre text,
  p_max_numero integer,
  p_precio_por_numero integer,
  p_paquetes jsonb,
  p_numeros_bendecidos integer[],
  p_sorteo_fecha text,
  p_nequi_numero text,
  p_nequi_nombre text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_raffle_id uuid;
begin
  insert into raffles (
    organization_id, nombre, estado, max_numero, precio_por_numero,
    paquetes, numeros_bendecidos, sorteo_fecha, nequi_numero, nequi_nombre
  ) values (
    p_organization_id, p_nombre, 'activa', p_max_numero, p_precio_por_numero,
    p_paquetes, p_numeros_bendecidos, p_sorteo_fecha, p_nequi_numero, p_nequi_nombre
  ) returning id into v_raffle_id;

  insert into numeros (raffle_id, organization_id, numero, es_bendecido)
  select v_raffle_id, p_organization_id, n, n = any(p_numeros_bendecidos)
  from generate_series(0, p_max_numero) as n;

  return v_raffle_id;
end;
$$;

revoke execute on function crear_rifa(uuid, text, integer, integer, jsonb, integer[], text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- reservar_numeros_rifa: public-facing (buyer) reservation, scoped by
-- p_raffle_id only -- organization_id is derived server-side from the raffle
-- itself (safer than accepting it as a second client-suppliable parameter,
-- since that would open a raffle_id/organization_id mismatch/spoofing
-- surface with no upside; the consistency trigger below would reject the
-- mismatch anyway, but deriving it removes the surface entirely). Wiring
-- this into app/actions.ts (resolving p_raffle_id from the request's tenant)
-- is Phase 4/5 territory, not this batch -- see design's File Changes for
-- app/actions.ts, not listed under Phase 2's task list.
-- ---------------------------------------------------------------------------
create or replace function reservar_numeros_rifa(
  p_raffle_id uuid,
  p_cantidad integer,
  p_nombre text, p_apellido text, p_correo text, p_whatsapp text,
  p_direccion text, p_ciudad text, p_paquete_tipo text
) returns table(reserva_id uuid, numeros_asignados integer[])
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization_id uuid;
  v_reserva_id uuid;
  v_numeros integer[];
begin
  -- keep in sync with MAX_CUSTOM_QTY in lib/constants.ts
  if p_cantidad < 1 or p_cantidad > 200 then
    raise exception 'Cantidad inválida';
  end if;

  select organization_id into v_organization_id from raffles
  where id = p_raffle_id and estado = 'activa';
  if v_organization_id is null then
    raise exception 'Rifa no encontrada o no está activa';
  end if;

  select array_agg(numero) into v_numeros from (
    select numero from numeros
    where raffle_id = p_raffle_id and estado = 'disponible'
    order by random()
    limit p_cantidad
    for update skip locked
  ) sub;

  if v_numeros is null or array_length(v_numeros, 1) < p_cantidad then
    raise exception 'No hay suficientes números disponibles';
  end if;

  insert into reservas (
    raffle_id, organization_id, nombre, apellido, correo, whatsapp,
    direccion, ciudad, paquete_tipo, numeros_asignados, estado, expira_en
  ) values (
    p_raffle_id, v_organization_id, p_nombre, p_apellido, p_correo, p_whatsapp,
    p_direccion, p_ciudad, p_paquete_tipo, v_numeros, 'pendiente_pago', now() + interval '10 minutes'
  ) returning id into v_reserva_id;

  update numeros set estado = 'reservado', reserva_id = v_reserva_id
  where raffle_id = p_raffle_id and numero = any(v_numeros);

  return query select v_reserva_id, v_numeros;
end;
$$;

revoke execute on function reservar_numeros_rifa(uuid, integer, text, text, text, text, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- confirmar_pago_rifa: admin-only, tenant-scoped by p_organization_id. Does
-- not need p_raffle_id -- both reservas/numeros updates key off reserva_id,
-- which is already a unique row reference regardless of the numeros PK
-- change (unlike editar/reasignar below, which key off bare numero values).
-- ---------------------------------------------------------------------------
create or replace function confirmar_pago_rifa(p_organization_id uuid, p_reserva_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_estado text;
  v_comprobante text;
begin
  select estado, comprobante_url into v_estado, v_comprobante
  from reservas where id = p_reserva_id and organization_id = p_organization_id
  for update;

  if v_estado is null then
    raise exception 'Reserva no encontrada';
  end if;

  if v_estado not in ('pendiente_pago', 'en_verificacion') then
    raise exception 'Solo se puede confirmar una reserva pendiente o en verificación';
  end if;

  if v_comprobante is null then
    raise exception 'La reserva no tiene comprobante de pago';
  end if;

  update reservas set estado = 'confirmado' where id = p_reserva_id and organization_id = p_organization_id;
  update numeros set estado = 'vendido' where reserva_id = p_reserva_id and organization_id = p_organization_id;
end;
$$;

revoke execute on function confirmar_pago_rifa(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- rechazar_reserva_rifa: admin-only, tenant-scoped by p_organization_id.
-- Same organization_id-only rationale as confirmar_pago_rifa above.
-- ---------------------------------------------------------------------------
create or replace function rechazar_reserva_rifa(p_organization_id uuid, p_reserva_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_estado text;
begin
  select estado into v_estado from reservas
  where id = p_reserva_id and organization_id = p_organization_id
  for update;

  if v_estado is null then
    raise exception 'Reserva no encontrada';
  end if;

  if v_estado not in ('pendiente_pago', 'en_verificacion') then
    raise exception 'Solo se puede rechazar una reserva pendiente o en verificación';
  end if;

  update numeros set estado = 'disponible', reserva_id = null
  where reserva_id = p_reserva_id and organization_id = p_organization_id;
  update reservas set estado = 'rechazado' where id = p_reserva_id and organization_id = p_organization_id;
end;
$$;

revoke execute on function rechazar_reserva_rifa(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- editar_numero_rifa: admin-only, tenant-scoped by BOTH p_organization_id
-- (reservas predicate) AND p_raffle_id (every numeros predicate: existence
-- check, availability check, and both release/reassignment updates) -- see
-- design D2 for the exact cross-raffle collision this closes now that
-- numeros' PK is (raffle_id, numero).
-- ---------------------------------------------------------------------------
create or replace function editar_numero_rifa(
  p_organization_id uuid, p_raffle_id uuid, p_reserva_id uuid,
  p_numero_anterior integer, p_numero_nuevo integer
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_estado text;
  v_nuevo_estado text;
begin
  select estado into v_estado from reservas
  where id = p_reserva_id and organization_id = p_organization_id and raffle_id = p_raffle_id
  for update;

  if v_estado is null then
    raise exception 'Reserva no encontrada';
  end if;

  if v_estado not in ('pendiente_pago', 'en_verificacion') then
    raise exception 'Solo se pueden editar números de una reserva pendiente o en verificación';
  end if;

  if p_numero_anterior = p_numero_nuevo then
    return;
  end if;

  select estado into v_nuevo_estado from numeros
  where numero = p_numero_nuevo and raffle_id = p_raffle_id
  for update;

  if v_nuevo_estado is null then
    raise exception 'El número % no existe', p_numero_nuevo;
  end if;

  if v_nuevo_estado <> 'disponible' then
    raise exception 'El número % no está disponible', p_numero_nuevo;
  end if;

  perform 1 from numeros
  where numero = p_numero_anterior and raffle_id = p_raffle_id and reserva_id = p_reserva_id
  for update;
  if not found then
    raise exception 'El número % no pertenece a esta reserva', p_numero_anterior;
  end if;

  update numeros set estado = 'disponible', reserva_id = null
  where numero = p_numero_anterior and raffle_id = p_raffle_id;
  update numeros set estado = 'reservado', reserva_id = p_reserva_id
  where numero = p_numero_nuevo and raffle_id = p_raffle_id;
  update reservas set numeros_asignados = array_replace(numeros_asignados, p_numero_anterior, p_numero_nuevo)
  where id = p_reserva_id and organization_id = p_organization_id;
end;
$$;

revoke execute on function editar_numero_rifa(uuid, uuid, uuid, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- reasignar_numeros_rifa: admin-only, tenant-scoped by BOTH
-- p_organization_id AND p_raffle_id. The final assign statement
-- (`update numeros set estado = 'reservado', reserva_id = p_reserva_id
-- where numero = any(v_numeros) and raffle_id = p_raffle_id`) is called out
-- BY NAME in design D2 as a CRITICAL fix target -- it is a distinct
-- statement from editar_numero_rifa's updates and must not be omitted, since
-- without `and raffle_id = p_raffle_id` it could silently assign into
-- another raffle's (or tenant's) row sharing the same integer numero.
-- ---------------------------------------------------------------------------
create or replace function reasignar_numeros_rifa(p_organization_id uuid, p_raffle_id uuid, p_reserva_id uuid)
returns integer[]
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_estado text;
  v_cantidad integer;
  v_numeros integer[];
begin
  select estado, array_length(numeros_asignados, 1) into v_estado, v_cantidad
  from reservas
  where id = p_reserva_id and organization_id = p_organization_id and raffle_id = p_raffle_id
  for update;

  if v_estado is null then
    raise exception 'Reserva no encontrada';
  end if;

  if v_estado not in ('pendiente_pago', 'en_verificacion') then
    raise exception 'Solo se pueden reasignar números de una reserva pendiente o en verificación';
  end if;

  update numeros set estado = 'disponible', reserva_id = null
  where reserva_id = p_reserva_id and raffle_id = p_raffle_id;

  select array_agg(numero) into v_numeros from (
    select numero from numeros
    where raffle_id = p_raffle_id and estado = 'disponible'
    order by random()
    limit v_cantidad
    for update skip locked
  ) sub;

  if v_numeros is null or array_length(v_numeros, 1) < v_cantidad then
    raise exception 'No hay suficientes números disponibles para reasignar';
  end if;

  -- The final assign statement -- see header comment above; the
  -- `and raffle_id = p_raffle_id` predicate here is the exact fix design D2
  -- flags as a Round 2 CRITICAL regression when omitted.
  update numeros set estado = 'reservado', reserva_id = p_reserva_id
  where numero = any(v_numeros) and raffle_id = p_raffle_id;
  update reservas set numeros_asignados = v_numeros where id = p_reserva_id and organization_id = p_organization_id;

  return v_numeros;
end;
$$;

revoke execute on function reasignar_numeros_rifa(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Consistency safeguard (task 2.7/2.8): numeros.organization_id and
-- reservas.organization_id must always equal the owning raffles.organization_id
-- -- this was missing from 0006-0009 despite organization_id being
-- denormalized specifically for auth-scope indexing/RLS (design D1). A
-- BEFORE trigger, not a CHECK constraint, since CHECK cannot reference
-- another table. Fires on every INSERT (always) and on UPDATE only when
-- raffle_id/organization_id are part of the SET list (Postgres' `UPDATE OF
-- col_list` restricts firing to UPDATE, not INSERT) -- so it never fires for
-- the legacy 0001/0004 RPCs' updates, which only ever touch estado/reserva_id.
--
-- NULL raffle_id is deliberately allowed through untouched: unlike
-- numeros.raffle_id (NOT NULL-enforced by 0009_tenant_constraints.sql),
-- reservas.raffle_id was never given that same CHECK -- the legacy
-- reservar_numeros RPC (0001/0003) still inserts reservas rows with no
-- raffle_id/organization_id at all, and 0001-era tests
-- (tests/reservar-numeros.test.ts, tests/admin-rpcs.test.ts) do the same
-- directly. Rejecting NULL here would break every one of those
-- still-serving legacy paths (design's "old RPCs still serving" rollout
-- step) for a column this trigger has no consistency claim to make about in
-- the first place when it's simply unset.
-- ---------------------------------------------------------------------------
create or replace function enforce_organization_id_matches_raffle() returns trigger
language plpgsql as $$
declare
  v_raffle_org uuid;
begin
  if new.raffle_id is null then
    return new;
  end if;

  select organization_id into v_raffle_org from raffles where id = new.raffle_id;

  if v_raffle_org is null then
    raise exception '% references raffle_id % which does not exist', tg_table_name, new.raffle_id;
  end if;

  if new.organization_id is distinct from v_raffle_org then
    raise exception '%.organization_id (%) does not match owning raffle''s organization_id (%)',
      tg_table_name, new.organization_id, v_raffle_org;
  end if;

  return new;
end;
$$;

create trigger numeros_organization_id_consistency
  before insert or update of raffle_id, organization_id on numeros
  for each row execute function enforce_organization_id_matches_raffle();

create trigger reservas_organization_id_consistency
  before insert or update of raffle_id, organization_id on reservas
  for each row execute function enforce_organization_id_matches_raffle();
