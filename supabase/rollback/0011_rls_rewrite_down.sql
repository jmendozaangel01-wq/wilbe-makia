-- Down-script for supabase/migrations/0011_rls_rewrite.sql. Restores
-- 0004_admin_panel.sql's blanket authenticated-read policies on
-- reservas/numeros. Only safe to run if nothing later depends on
-- membership-scoped RLS being in place (e.g. requireAdminContext() reading
-- organization_members/raffles/organizations via the authenticated client).

drop policy if exists "members_read_numeros" on numeros;
drop policy if exists "members_read_reservas" on reservas;
drop policy if exists "members_read_raffles" on raffles;
drop policy if exists "members_read_organizations" on organizations;
drop policy if exists "members_read_own_membership" on organization_members;

create policy "authenticated_read_reservas" on reservas for select to authenticated using (true);
create policy "authenticated_read_numeros" on numeros for select to authenticated using (true);
