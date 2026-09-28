-- Makes the prize shown on a tenant's public page configurable per raffle.
-- Until now components/Hero.tsx hardcoded the first tenant's prize ("GÁNATE
-- UNA XTZ 660 0-KM" + /moto-hero.jpg) for every tenant. The prize now lives on
-- the raffle row so each organization advertises its own.
--
-- 1. raffles.premio_nombre (text NOT NULL, 1..120 chars trimmed) is the WHOLE
--    public title phrase, shown exactly as typed -- there is deliberately no
--    fixed "GÁNATE UNA" prefix, so gender and plurals are never a problem.
--    raffles.premio_imagen_url (text NULL) is an optional prize photo; with no
--    photo the public page renders no image block at all.
--
-- 2. Backfill, in this order so NOT NULL can be applied at the end:
--    - tenant-zero (organizations.is_platform_owner) keeps its current public
--      look: the original title and the moto-hero.jpg that already ships in
--      public/, addressed through its own subdomain on the apex domain (the
--      page is served per tenant host, and a relative path would not resolve
--      from the admin preview).
--    - every other raffle gets its own raffles.nombre as a provisional title
--      the owner can edit from the Configuracion tab.
--
-- 3. crear_rifa(), crear_organizacion_con_rifa() and actualizar_rifa() gain
--    the new parameters. Adding parameters to an existing function in Postgres
--    creates an OVERLOAD instead of replacing it, and PostgREST cannot pick
--    between two candidates when a caller passes only the shared named args
--    ("Could not choose the best candidate function"). So each function is
--    dropped by its OLD exact signature and re-created with the new one, and
--    the revoke/grant statements are re-issued on the NEW signature (grants
--    are per-signature and do not carry over). The new parameters are appended
--    at the END with `default null`, so callers that pass named args and know
--    nothing about the prize keep working:
--    - crear_rifa: a NULL/blank title falls back to p_nombre.
--    - crear_organizacion_con_rifa: a NULL title falls back to the raffle name
--      (through crear_rifa); a non-NULL title is validated here because this
--      RPC is directly callable by any authenticated user.
--    - actualizar_rifa: NULL means "leave unchanged", the same convention as
--      p_logo_url / p_qr_url.
--    Function bodies are otherwise identical to 0010 (crear_rifa), 0012
--    (crear_organizacion_con_rifa) and 0017 (actualizar_rifa, including the
--    numeros.es_bendecido resync).
--
-- Limits mirror lib/onboarding/validate.ts (MAX_PREMIO_NOMBRE) and
-- lib/tenant/logo.ts (isValidLogoUrl: http(s) scheme, 2048 chars).
--
-- Deploy order: apply this BEFORE the code that selects premio_nombre reaches
-- production (until then the public page and the admin config tab fall back to
-- "unavailable"). Applying it first is safe with the old code: the old callers
-- pass named args and the new parameters default to null.
--
-- One transaction, so a failure leaves nothing half-applied (columns added but
-- functions not swapped). It is therefore NOT idempotent: re-run it only after
-- a failed, fully rolled-back attempt. lock_timeout makes the ALTER give up
-- instead of queueing behind a long transaction and blocking reads on raffles.

begin;

set local lock_timeout = '5s';

alter table raffles
  add column premio_nombre text,
  add column premio_imagen_url text;

update raffles r
set premio_nombre = 'GÁNATE UNA XTZ 660 0-KM',
    premio_imagen_url = 'https://' || o.subdomain || '.benditarifa.com/moto-hero.jpg'
from organizations o
where o.id = r.organization_id
  and o.is_platform_owner = true;

-- left()/nullif keep the backfill from tripping the CHECK below on a legacy
-- name that is blank or longer than 120 chars.
update raffles
set premio_nombre = coalesce(nullif(left(trim(nombre), 120), ''), 'Rifa')
where premio_nombre is null;

alter table raffles
  alter column premio_nombre set not null,
  add constraint raffles_premio_nombre_length
    check (length(trim(premio_nombre)) between 1 and 120),
  add constraint raffles_premio_imagen_url_format
    check (premio_imagen_url is null or (premio_imagen_url ~ '^https?://' and length(premio_imagen_url) <= 2048));

-- ---------------------------------------------------------------------------
-- crear_rifa
-- ---------------------------------------------------------------------------
drop function crear_rifa(uuid, text, integer, integer, jsonb, integer[], text, text, text);

create function crear_rifa(
  p_organization_id uuid,
  p_nombre text,
  p_max_numero integer,
  p_precio_por_numero integer,
  p_paquetes jsonb,
  p_numeros_bendecidos integer[],
  p_sorteo_fecha text,
  p_nequi_numero text,
  p_nequi_nombre text,
  p_premio_nombre text default null,
  p_premio_imagen_url text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_raffle_id uuid;
begin
  insert into raffles (
    organization_id, nombre, estado, max_numero, precio_por_numero,
    paquetes, numeros_bendecidos, sorteo_fecha, nequi_numero, nequi_nombre,
    premio_nombre, premio_imagen_url
  ) values (
    p_organization_id, p_nombre, 'activa', p_max_numero, p_precio_por_numero,
    p_paquetes, p_numeros_bendecidos, p_sorteo_fecha, p_nequi_numero, p_nequi_nombre,
    coalesce(nullif(trim(p_premio_nombre), ''), p_nombre), p_premio_imagen_url
  ) returning id into v_raffle_id;

  insert into numeros (raffle_id, organization_id, numero, es_bendecido)
  select v_raffle_id, p_organization_id, n, n = any(p_numeros_bendecidos)
  from generate_series(0, p_max_numero) as n;

  return v_raffle_id;
end;
$$;

revoke execute on function crear_rifa(uuid, text, integer, integer, jsonb, integer[], text, text, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- crear_organizacion_con_rifa
-- ---------------------------------------------------------------------------
drop function crear_organizacion_con_rifa(text, text, text, integer, integer, jsonb, integer[], text, text, text);

create function crear_organizacion_con_rifa(
  p_nombre text,
  p_subdomain text,
  p_raffle_nombre text,
  p_max_numero integer,
  p_precio_por_numero integer,
  p_paquetes jsonb,
  p_numeros_bendecidos integer[],
  p_sorteo_fecha text,
  p_nequi_numero text,
  p_nequi_nombre text,
  p_premio_nombre text default null
) returns table(organization_id uuid, raffle_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org_id uuid;
  v_raffle_id uuid;
  v_paquete jsonb;
  v_blessed integer[];
begin
  -- Server-side validation: the raffles CHECK constraints only cover some of
  -- these, and this RPC is directly callable by any authenticated user.
  -- Keep limits in sync with lib/onboarding/validate.ts (org name 60, raffle
  -- name 80, blessed 50, nequi number 10 digits, nequi name 80, date 40).
  if p_nombre is null or length(trim(p_nombre)) < 1 or length(trim(p_nombre)) > 60 then
    raise exception 'Nombre de organización inválido';
  end if;

  if p_raffle_nombre is null or length(trim(p_raffle_nombre)) < 1 or length(trim(p_raffle_nombre)) > 80 then
    raise exception 'Nombre de rifa inválido';
  end if;

  -- NULL is allowed (old callers): crear_rifa() then falls back to the raffle
  -- name. Limit mirrors lib/onboarding/validate.ts (MAX_PREMIO_NOMBRE).
  if p_premio_nombre is not null
     and (length(trim(p_premio_nombre)) < 1 or length(trim(p_premio_nombre)) > 120) then
    raise exception 'Título de la rifa inválido';
  end if;

  if p_max_numero is null or p_max_numero < 9 or p_max_numero > 99999 then
    raise exception 'max_numero fuera de rango';
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
       or (v_paquete ->> 'qty')::bigint > p_max_numero + 1
       or (v_paquete ->> 'price')::bigint < 1
       or (v_paquete ->> 'price')::bigint > 2000000000 then
      raise exception 'Paquete inválido';
    end if;
  end loop;

  -- NULL means "no blessed numbers": normalize so downstream array
  -- comparisons (n = any(...)) never see NULL.
  v_blessed := coalesce(p_numeros_bendecidos, array[]::integer[]);

  -- crear_rifa() inserts these as-is and the raffle page renders them
  -- publicly, so bound them here (limits mirror lib/onboarding/validate.ts).
  if cardinality(v_blessed) > 50 then
    raise exception 'Demasiados números bendecidos';
  end if;

  if exists (
    select 1 from unnest(v_blessed) as b(n)
    where b.n is null or b.n < 0 or b.n > p_max_numero
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

  select o.organization_id into v_org_id from crear_organizacion(p_nombre, p_subdomain) o;

  v_raffle_id := crear_rifa(
    v_org_id,
    p_raffle_nombre,
    p_max_numero,
    p_precio_por_numero,
    p_paquetes,
    v_blessed,
    p_sorteo_fecha,
    p_nequi_numero,
    p_nequi_nombre,
    p_premio_nombre
  );

  return query select v_org_id, v_raffle_id;
end;
$$;

revoke execute on function crear_organizacion_con_rifa(text, text, text, integer, integer, jsonb, integer[], text, text, text, text)
  from public, anon;
grant execute on function crear_organizacion_con_rifa(text, text, text, integer, integer, jsonb, integer[], text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- actualizar_rifa
-- ---------------------------------------------------------------------------
drop function actualizar_rifa(uuid, uuid, text, integer, jsonb, integer[], text, text, text, text, text);

create function actualizar_rifa(
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
  p_qr_url text default null,
  p_premio_nombre text default null,
  p_premio_imagen_url text default null
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

  -- NULL means "leave unchanged" (same convention as p_logo_url/p_qr_url), so
  -- a form submit that doesn't touch the prize photo never clears it. Both
  -- updates are scoped by id AND organization_id like the qr_url one above.
  if p_premio_nombre is not null then
    if length(trim(p_premio_nombre)) < 1 or length(trim(p_premio_nombre)) > 120 then
      raise exception 'Título de la rifa inválido';
    end if;

    update raffles set premio_nombre = trim(p_premio_nombre)
    where id = p_raffle_id and organization_id = p_organization_id;
  end if;

  if p_premio_imagen_url is not null then
    -- Same defense-in-depth as p_qr_url above.
    if p_premio_imagen_url !~ '^https?://' or length(p_premio_imagen_url) > 2048 then
      raise exception 'Imagen del premio inválida';
    end if;

    update raffles set premio_imagen_url = p_premio_imagen_url
    where id = p_raffle_id and organization_id = p_organization_id;
  end if;
end;
$$;

revoke execute on function actualizar_rifa(uuid, uuid, text, integer, jsonb, integer[], text, text, text, text, text, text, text)
  from public, anon, authenticated;

commit;
