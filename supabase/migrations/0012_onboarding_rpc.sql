-- Phase 5 (Google OAuth onboarding): atomic self-service organization + first
-- raffle creation.
--
-- 1. crear_organizacion() gains a one-organization-per-caller guard. Without
--    it, any Google-authenticated user could call the RPC in a loop and mint
--    unlimited tenants (each with its own 14-day trial). v1 has no team
--    invites and the onboarding wizard only serves users with zero
--    memberships, so a caller who already belongs to an organization is
--    always a misuse. Signature and grants are unchanged (create or replace).
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
begin
  select o.organization_id into v_org_id from crear_organizacion(p_nombre, p_subdomain) o;

  v_raffle_id := crear_rifa(
    v_org_id,
    p_raffle_nombre,
    p_max_numero,
    p_precio_por_numero,
    p_paquetes,
    p_numeros_bendecidos,
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
