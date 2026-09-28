-- Tenant admin raffle configuration panel (product/tenant-admin-raffle-config,
-- engram). Two independent, additive pieces:
--
-- 1. actualizar_rifa(): the first update path for a raffle after creation.
--    Editable: nombre, precio_por_numero (+ recomputed paquetes), sorteo_fecha,
--    nequi_numero, nequi_nombre, numeros_bendecidos, and (optionally, via
--    p_logo_url) the owning organization's logo_url.
--
--    max_numero is deliberately NOT a parameter here, at all -- editing it
--    post-creation would require reseeding the numeros pool (insert rows for
--    a larger range, or delete for a smaller one) while staying consistent
--    with any numbers already committed (reservado/vendido). That reseed
--    logic is real design work on its own (concurrency, es_bendecido
--    recomputation) and is explicitly out of scope for this batch -- see the
--    apply report. max_numero stays permanently read-only from this panel;
--    changing it, if ever needed, requires a follow-up change.
--
--    Same SECURITY DEFINER + p_organization_id/p_raffle_id tenant-scoping
--    convention as every other admin RPC in 0010_tenant_rpcs.sql, and the
--    same field-level validation crear_organizacion_con_rifa() (0012) applies
--    to the raffle half of its input -- kept in sync deliberately (see that
--    migration's own comment on limits mirroring lib/onboarding/validate.ts;
--    lib/raffle-config/validate.ts mirrors the same limits for this RPC).
--
-- 2. raffles.qr_url: the tenant's own Nequi payment QR code, next to
--    nequi_numero/nequi_nombre on the same table. Like logo_url before this
--    migration, there was no per-tenant QR at all -- the real buyer-facing
--    purchase flow (components/rifa/ReservationForm.tsx) rendered a single
--    hardcoded image (public/nequi-qr.jpeg) for every tenant. Optional
--    (nullable): a tenant can save the rest of this form without a QR, and
--    the buyer page falls back to showing the Nequi number/name without an
--    image rather than reusing another tenant's QR.
--
-- 3. A public 'logos' Storage bucket -- organizations.logo_url has existed
--    since 0006 and lib/tenant/logo.ts's isValidLogoUrl() has been the
--    designated write-time+render-time guard since design D7, but no bucket
--    or write path has ever existed until now (confirmed: logo_url was only
--    ever set out-of-band, directly in the DB). Unlike 'comprobantes' (0002,
--    private), this bucket must be public: the logo is rendered as a raw
--    <img src> on the public marketing/raffle page (components/Hero.tsx) for
--    anonymous visitors, so a signed URL isn't an option. Writes still go
--    exclusively through the service-role client
--    (app/admin/config-actions.ts), matching comprobantes' pattern -- no
--    insert/update storage policy for anon/authenticated, so making the
--    bucket public only ever grants read access, never write.

alter table raffles add column qr_url text;

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

insert into storage.buckets (id, name, public) values ('logos', 'logos', true);
