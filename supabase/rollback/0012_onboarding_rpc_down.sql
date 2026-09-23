-- Down-script for supabase/migrations/0012_onboarding_rpc.sql. Drops the
-- wrapper RPC and restores crear_organizacion() to its 0010 definition
-- (without the one-organization-per-caller guard).

drop function if exists crear_organizacion_con_rifa(text, text, text, integer, integer, jsonb, integer[], text, text, text);

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

  if v_subdomain !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception 'Subdomain inválido';
  end if;

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
