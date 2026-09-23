-- Phase 5 (Google OAuth onboarding): atomic self-service organization + first
-- raffle creation.
--
-- 1. crear_organizacion() gains a one-organization-per-caller guard. Without
--    it, any Google-authenticated user could call the RPC in a loop and mint
--    unlimited tenants (each with its own 14-day trial). v1 has no team
--    invites and the onboarding wizard only serves users with zero
--    memberships, so a caller who already belongs to an organization is
--    always a misuse. The check runs under a per-user advisory transaction
--    lock so concurrent calls cannot both pass it. Signature and grants are
--    unchanged (create or replace).
--
-- 2. crear_organizacion_con_rifa() wraps crear_organizacion() + crear_rifa()
--    so the wizard creates org, owner membership, raffle and seeded numeros
--    pool in ONE transaction (a failure in the raffle half -- e.g. a
--    max_numero above the platform cap -- rolls back the organization too, so
--    the user is never left with an org and no raffle). It accepts no
--    client-suppliable organization_id: the id is generated inside
--    crear_organizacion() and threaded straight into crear_rifa().
--    crear_rifa() is revoked from authenticated (0010) but the definer-owned
--    call from within this SECURITY DEFINER function still works.

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

  -- Serialize concurrent calls by the same user: without the lock two
  -- parallel calls both pass the EXISTS check below and each mint an org.
  -- Transaction-scoped, released automatically at commit/rollback.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  if exists (select 1 from organization_members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a una organización';
  end if;

  v_subdomain := lower(trim(p_subdomain));

  if v_subdomain is null or length(v_subdomain) = 0 then
    raise exception 'Subdomain requerido';
  end if;

  -- DNS-label charset/length allowlist (see 0010 for rationale)
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

create or replace function crear_organizacion_con_rifa(
  p_nombre text,
  p_subdomain text,
  p_raffle_nombre text,
  p_max_numero integer,
  p_precio_por_numero integer,
  p_paquetes jsonb,
  p_numeros_bendecidos integer[],
  p_sorteo_fecha text,
  p_nequi_numero text,
  p_nequi_nombre text
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
    p_nequi_nombre
  );

  return query select v_org_id, v_raffle_id;
end;
$$;

revoke execute on function crear_organizacion_con_rifa(text, text, text, integer, integer, jsonb, integer[], text, text, text)
  from public, anon;
grant execute on function crear_organizacion_con_rifa(text, text, text, integer, integer, jsonb, integer[], text, text, text)
  to authenticated;
