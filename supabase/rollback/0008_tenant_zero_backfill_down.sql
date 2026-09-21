-- Down-script for supabase/migrations/0008_tenant_zero_backfill.sql.
--
-- NOT applied automatically -- see supabase/rollback/0006_organizations_down.sql
-- for why this lives outside supabase/migrations/. Run manually, and only if
-- nothing later than 0008 has been applied yet (0009 promotes raffle_id to
-- NOT NULL and part of numeros' primary key, which depends on this backfill
-- having run -- reversing 0008 after 0009 is applied is not supported by
-- this script; use a snapshot restore instead).

do $$
declare
  v_org_id uuid;
begin
  select id into v_org_id from organizations where is_platform_owner = true;

  if v_org_id is null then
    return;
  end if;

  update numeros set raffle_id = null, organization_id = null where organization_id = v_org_id;
  update reservas set raffle_id = null, organization_id = null where organization_id = v_org_id;

  delete from organization_members where organization_id = v_org_id;
  delete from raffles where organization_id = v_org_id;
  delete from organizations where id = v_org_id;
end $$;
