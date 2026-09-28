-- Fixes a data-consistency gap left by 0015_raffle_config_update.sql: the
-- tenant admin can edit raffles.numeros_bendecidos through actualizar_rifa(),
-- but the RPC never touched numeros.es_bendecido. Everything public reads the
-- per-row flag, not the array -- app/page.tsx (loadBlessedNumbersData) and the
-- anon RLS policy from 0005_public_blessed_numbers.sql both filter on
-- numeros.es_bendecido -- so after an admin edit the public landing kept
-- showing the previous blessed numbers (or none at all). Real case: tenant
-- 'mrjota' has raffles.numeros_bendecidos = {42} but zero numeros rows flagged.
--
-- 1. actualizar_rifa() is re-created with the exact same 11-argument
--    signature, security definer, search_path and validation as 0015, plus one
--    statement: right after raffles.numeros_bendecidos is written, the
--    numeros.es_bendecido flags of THAT raffle are resynced to match. Only
--    rows whose flag actually changes are touched (IS DISTINCT FROM), so an
--    edit that leaves the list unchanged writes nothing. Ownership of
--    p_raffle_id by p_organization_id was already enforced by the
--    select ... for update at the top of the function (raise 'Rifa no
--    encontrada' otherwise), so the resync can't reach another tenant's rows.
--    The function lives in this migration rather than an edit of 0015 because
--    0015 is already applied in production.
--
-- 2. One-time, idempotent backfill for every existing raffle: repairs raffles
--    that were edited through 0015 before this fix (flags out of sync with
--    their own numeros_bendecidos). Re-running it is a no-op.
--
-- Broadcast triggers (0013_blessed_numbers_broadcast.sql): neither UPDATE
-- below fires them. blessed_number_update_broadcast only fires WHEN
-- new.es_bendecido = true AND old.estado IS DISTINCT FROM new.estado, and
-- these statements change es_bendecido only, never estado, so the WHEN clause
-- is false for every row; blessed_number_insert_broadcast is INSERT-only.
-- That is acceptable here: the broadcast tells anon clients that a blessed
-- number's availability (estado) changed, and no estado changes. The public
-- page reads es_bendecido at request time, so a newly flagged number shows up
-- on the next load without a live push.

create or replace function actualizar_rifa(
  p_organization_id uuid,
  p_raffle_id uuid,
  p_nombre text,
  p_precio_por_numero integer,
  p_paquetes jsonb,
  p_numeros_bendecidos integer[],
  p_sorteo_fecha text,
  p_nequi_numero text,
  p_nequi_nombre text,
  p_logo_url text default null,
  p_qr_url text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_max_numero integer;
  v_paquete jsonb;
  v_blessed integer[];
begin
  select max_numero into v_max_numero from raffles
  where id = p_raffle_id and organization_id = p_organization_id
  for update;

  if v_max_numero is null then
    raise exception 'Rifa no encontrada';
  end if;

  -- Same limits as crear_organizacion_con_rifa's raffle half (0012) --
  -- kept in sync deliberately, see header comment.
  if p_nombre is null or length(trim(p_nombre)) < 1 or length(trim(p_nombre)) > 80 then
    raise exception 'Nombre de rifa inválido';
  end if;

  if p_precio_por_numero is null or p_precio_por_numero < 1 or p_precio_por_numero > 10000000 then
    raise exception 'Precio por número fuera de rango';
  end if;

  if p_paquetes is null or jsonb_typeof(p_paquetes) <> 'array' or jsonb_array_length(p_paquetes) > 20 then
    raise exception 'Paquetes inválidos';
  end if;

  for v_paquete in select * from jsonb_array_elements(p_paquetes) loop
    if jsonb_typeof(v_paquete) <> 'object'
       or jsonb_typeof(v_paquete -> 'tipo') is distinct from 'string'
       or length(trim(v_paquete ->> 'tipo')) < 1
       or length(v_paquete ->> 'tipo') > 40
       or jsonb_typeof(v_paquete -> 'qty') is distinct from 'number'
       or (v_paquete ->> 'qty') !~ '^[0-9]{1,6}$'
       or jsonb_typeof(v_paquete -> 'price') is distinct from 'number'
       or (v_paquete ->> 'price') !~ '^[0-9]{1,10}$' then
      raise exception 'Paquete inválido';
    end if;

    if (v_paquete ->> 'qty')::bigint < 1
       or (v_paquete ->> 'qty')::bigint > v_max_numero + 1
       or (v_paquete ->> 'price')::bigint < 1
       or (v_paquete ->> 'price')::bigint > 2000000000 then
      raise exception 'Paquete inválido';
    end if;
  end loop;

  v_blessed := coalesce(p_numeros_bendecidos, array[]::integer[]);

  if cardinality(v_blessed) > 50 then
    raise exception 'Demasiados números bendecidos';
  end if;

  if exists (
    select 1 from unnest(v_blessed) as b(n)
    where b.n is null or b.n < 0 or b.n > v_max_numero
  ) then
    raise exception 'Número bendecido inválido';
  end if;

  if p_nequi_numero is null or p_nequi_numero !~ '^[0-9]{10}$' then
    raise exception 'Número Nequi inválido';
  end if;

  if p_nequi_nombre is null or length(trim(p_nequi_nombre)) < 1 or length(trim(p_nequi_nombre)) > 80 then
    raise exception 'Nombre Nequi inválido';
  end if;

  if p_sorteo_fecha is null or length(trim(p_sorteo_fecha)) < 1 or length(trim(p_sorteo_fecha)) > 40 then
    raise exception 'Fecha de sorteo inválida';
  end if;

  update raffles set
    nombre = trim(p_nombre),
    precio_por_numero = p_precio_por_numero,
    paquetes = p_paquetes,
    numeros_bendecidos = v_blessed,
    sorteo_fecha = trim(p_sorteo_fecha),
    nequi_numero = p_nequi_numero,
    nequi_nombre = trim(p_nequi_nombre)
  where id = p_raffle_id and organization_id = p_organization_id;

  -- Keep the per-row flag (what the public page and the anon RLS policy read)
  -- in sync with the array just written. Ownership was verified at the top of
  -- the function; only rows whose flag actually changes are updated.
  update numeros set es_bendecido = (numero = any(v_blessed))
  where raffle_id = p_raffle_id
    and es_bendecido is distinct from (numero = any(v_blessed));

  if p_logo_url is not null then
    -- Cheap defense-in-depth mirroring lib/tenant/logo.ts's isValidLogoUrl()
    -- scheme check -- the TS caller (app/admin/config-actions.ts) is the
    -- primary enforcement point and always calls isValidLogoUrl() itself
    -- before this RPC ever sees the value.
    if p_logo_url !~ '^https?://' or length(p_logo_url) > 2048 then
      raise exception 'Logo URL inválida';
    end if;

    update organizations set logo_url = p_logo_url where id = p_organization_id;
  end if;

  if p_qr_url is not null then
    -- Same defense-in-depth as p_logo_url above -- app/admin/config-actions.ts
    -- always calls isValidLogoUrl() (reused here; it's a generic http(s)
    -- scheme/length check, not logo-specific) before this RPC ever sees it.
    if p_qr_url !~ '^https?://' or length(p_qr_url) > 2048 then
      raise exception 'QR URL inválida';
    end if;

    update raffles set qr_url = p_qr_url where id = p_raffle_id and organization_id = p_organization_id;
  end if;
end;
$$;

revoke execute on function actualizar_rifa(uuid, uuid, text, integer, jsonb, integer[], text, text, text, text, text)
  from public, anon, authenticated;

-- One-time backfill: see header, item 2.
update numeros n set es_bendecido = (n.numero = any(r.numeros_bendecidos))
from raffles r
where r.id = n.raffle_id
  and n.es_bendecido is distinct from (n.numero = any(r.numeros_bendecidos));
