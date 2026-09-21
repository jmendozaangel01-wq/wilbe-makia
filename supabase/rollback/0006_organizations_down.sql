-- Down-script for supabase/migrations/0006_organizations.sql.
--
-- NOT applied automatically -- `npx supabase start`/`supabase db reset` only
-- apply files inside supabase/migrations/, in filename order. This file
-- lives outside that directory on purpose so it is never picked up by that
-- process. Run it manually (SQL editor or `psql -f`) only if 0006 needs to
-- be reversed and nothing later than 0006 has been applied yet.

drop function if exists org_access_active(uuid);
drop table if exists raffles;
drop table if exists organization_members;
drop table if exists organizations;
