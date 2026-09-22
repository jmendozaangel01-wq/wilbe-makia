-- Phase 2 / Unit 2, the HARD GATE, part 2 of 2. Replaces
-- 0004_admin_panel.sql's blanket authenticated_read_reservas /
-- authenticated_read_numeros policies -- which trusted "any authenticated
-- session = admin" because this project had no self-service signup yet --
-- with membership-scoped policies now that organization_members exists
-- (0006_organizations.sql) and lib/auth/admin-context.ts (this same batch,
-- app/admin/actions.ts) actually checks membership before granting admin
-- access.
--
-- Adds a self-read SELECT policy on organization_members first --
-- without it, the "organization_id in (select ... from organization_members
-- where user_id = auth.uid())" subquery pattern used below would always
-- return an empty set for every authenticated caller: organization_members
-- has had RLS enabled with zero policies (including SELECT) since 0006,
-- deliberately deferring "a concrete authenticated direct-read need" to a
-- later phase (see that file's RLS comment) -- this is that phase.

drop policy if exists "authenticated_read_reservas" on reservas;
drop policy if exists "authenticated_read_numeros" on numeros;

create policy "members_read_own_membership" on organization_members
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "members_read_organizations" on organizations
  for select to authenticated
  using (id in (select organization_id from organization_members where user_id = (select auth.uid())));

create policy "members_read_raffles" on raffles
  for select to authenticated
  using (organization_id in (select organization_id from organization_members where user_id = (select auth.uid())));

create policy "members_read_reservas" on reservas
  for select to authenticated
  using (organization_id in (select organization_id from organization_members where user_id = (select auth.uid())));

create policy "members_read_numeros" on numeros
  for select to authenticated
  using (organization_id in (select organization_id from organization_members where user_id = (select auth.uid())));
