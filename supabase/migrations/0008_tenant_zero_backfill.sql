-- Multi-tenant foundation, part 3 of 4. Seeds the tenant-zero organization
-- (the live Wilber Makia raffle, becoming the platform owner per D4) and its
-- raffle row from the current lib/constants.ts values, then backfills every
-- existing numeros/reservas row to point at them. Also seeds the
-- organization_members owner row for whichever auth.users already exist in
-- this environment (zero rows on a fresh local/test stack -- fine, this
-- insert is a no-op there; exactly one row in production today, the single
-- existing password-authenticated admin), so requireAdminContext() (added in
-- a later phase) succeeds the moment that phase deploys, with zero lockout
-- window.
--
-- Placeholder decision: subdomain 'wilbermakia' is chosen here as the
-- tenant-zero subdomain since no production subdomain has been confirmed yet
-- (see Open Questions in the design doc re: subdomain mutability). Confirm
-- or override before this migration is applied to a real environment.
--
-- Paired down-script: supabase/rollback/0008_tenant_zero_backfill_down.sql
-- (not auto-applied -- lives outside supabase/migrations/ on purpose, see
-- that file's header).

do $$
declare
  v_org_id uuid;
  v_raffle_id uuid;
begin
  insert into organizations (
    subdomain, nombre, is_platform_owner, subscription_status
  ) values (
    'wilbermakia', 'Wilber Makia', true, 'active'
  )
  returning id into v_org_id;

  insert into raffles (
    organization_id, nombre, estado, max_numero, precio_por_numero,
    paquetes, numeros_bendecidos, sorteo_fecha, nequi_numero, nequi_nombre
  ) values (
    v_org_id, 'Wilber Makia', 'activa', 99999, 200,
    '[
      {"tipo":"paquete_65","qty":65,"priceLabel":"13.000","price":13000,"popular":false},
      {"tipo":"paquete_100","qty":100,"priceLabel":"20.000","price":20000,"popular":true},
      {"tipo":"paquete_120","qty":120,"priceLabel":"24.000","price":24000,"popular":false}
    ]'::jsonb,
    array[7734,12583,29461,33780,41256,50912,62347,70594,81023,92468,10357,23689,34781,45902,56134],
    '15 OCT 2026', '3015649719', 'Jairo Mendoza'
  )
  returning id into v_raffle_id;

  update numeros set raffle_id = v_raffle_id, organization_id = v_org_id;
  update reservas set raffle_id = v_raffle_id, organization_id = v_org_id;

  -- Every existing auth.users row becomes an owner of tenant zero. On a
  -- fresh local/test stack this selects zero rows (no admin created yet) --
  -- intentional no-op, not an error.
  insert into organization_members (organization_id, user_id, role)
  select v_org_id, id, 'owner' from auth.users
  on conflict (organization_id, user_id) do nothing;
end $$;
