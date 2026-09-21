-- Down-script for supabase/migrations/0007_tenant_columns.sql.
--
-- NOT applied automatically -- see supabase/rollback/0006_organizations_down.sql
-- for why this lives outside supabase/migrations/. Run manually, and only if
-- nothing later than 0007 has been applied yet (0008 backfills these columns,
-- 0009 makes raffle_id NOT NULL and part of numeros' primary key).

drop index if exists reservas_organization_id_idx;
drop index if exists reservas_raffle_id_idx;
drop index if exists numeros_organization_id_idx;
drop index if exists numeros_raffle_id_estado_idx;

alter table reservas drop column if exists organization_id;
alter table reservas drop column if exists raffle_id;

alter table numeros drop column if exists organization_id;
alter table numeros drop column if exists raffle_id;
