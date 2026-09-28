-- Fixes a real blocker discovered while wiring the buyer-facing purchase flow
-- to each tenant's own data (product/tenant-admin-raffle-config in engram):
-- reservas.paquete_tipo's CHECK constraint (0001_init.sql) only ever allowed
-- the four literal values from the original single-tenant hardcoded config
-- ('paquete_65', 'paquete_100', 'paquete_120', 'custom'). Every raffle
-- created since onboarding shipped (0012_onboarding_rpc.sql) gets its
-- package tipos generated as `paquete_<qty>` from
-- DEFAULT_PACKAGE_QUANTITIES = [10, 50, 100] (lib/onboarding/validate.ts) --
-- so "paquete_10" and "paquete_50" reservations have been silently failing
-- this CHECK (Postgres error 23514) for every tenant except legacy
-- Wilbermakia (backfilled with 65/100/120 in 0008_tenant_zero_backfill.sql)
-- and the lucky coincidental "paquete_100" tier, since the very first
-- self-service raffle was created. reservar_numeros_rifa (0010) itself never
-- validated paquete_tipo against the raffle's own paquetes column at all --
-- this table CHECK was the only enforcement, and it enforced the wrong,
-- single-tenant thing.
--
-- Replacement: any `paquete_<positive integer>` tag (matching how every
-- write path -- crear_organizacion_con_rifa (0012), actualizar_rifa (0015)
-- -- actually generates tipo) or the literal 'custom' sentinel for the
-- free-quantity picker. Digit-count bound (1-6) matches the qty bound
-- already enforced on the same paquetes.qty values by those two RPCs.
alter table reservas drop constraint reservas_paquete_tipo_check;

alter table reservas add constraint reservas_paquete_tipo_check
  check (paquete_tipo = 'custom' or paquete_tipo ~ '^paquete_[0-9]{1,6}$');
