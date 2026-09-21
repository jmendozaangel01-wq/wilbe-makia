-- Multi-tenant foundation, part 4 of 4. Promotes raffle_id from nullable to
-- a real constraint and swaps numeros' primary key from (numero) to
-- (raffle_id, numero), so the same integer numero can exist in more than one
-- raffle. Runs against the LIVE, actively-written numeros table (the
-- reservar_numeros RPC is still taking traffic), so this is sequenced in
-- three phases, in this exact order -- do not reorder or merge them:
--
--   (1) CREATE UNIQUE INDEX CONCURRENTLY -- cannot run inside a transaction
--       block. Whatever applies this file must not wrap it in an implicit
--       transaction (Supabase CLI's migration runner executes each
--       statement individually rather than batching the whole file into one
--       query, so CONCURRENTLY is safe here -- verified by smoke-testing
--       this exact file against local Postgres per task 1.7).
--   (2) raffle_id NOT NULL enforcement via CHECK ... NOT VALID + VALIDATE,
--       which must fully complete before phase (3) begins. raffle_id is
--       already backfilled by 0008; numero needs no equivalent step here --
--       dropping its old PK constraint in phase (3) does not clear numero's
--       own NOT NULL flag, so the NOT NULL risk is specific to the newly
--       added raffle_id column.
--   (3) Drop the old numero-only PK, promote the already-built index to PK
--       (catalog-only, since phase (2) already validated raffle_id NOT NULL
--       beforehand -- no table rewrite, no full-table NOT NULL scan), add
--       the raffle_id/organization_id FKs NOT VALID, drop numero_display.
--       FK VALIDATE runs after, in its own lighter-weight pass. This is the
--       one and only place these FK constraints get added -- 0007 adds
--       raffle_id/organization_id as plain nullable columns with no inline
--       `references` on purpose, specifically so the FK doesn't get created
--       (and auto-validated) early under a Postgres-chosen constraint name
--       that would then collide with the explicit ADD CONSTRAINT here (this
--       exact collision was hit and fixed while smoke-testing this file
--       against local Postgres per task 1.7 -- see 0007's header comment).
--       These statements run back-to-back with no explicit BEGIN/COMMIT
--       wrapping them, matching the convention already used by every other
--       migration file in this project (0001-0008 don't use explicit
--       transaction control either). Each statement is individually fast
--       and catalog-only, and running them sequentially through one
--       connection, with nothing else able to interleave mid-file, gives
--       the same practical outcome as a single transaction for this
--       migration's purposes -- the tradeoff is losing formal
--       multi-statement atomicity if one statement fails partway (a real
--       but accepted risk for a one-time migration; see the down-script
--       note below for the worst-case fallback).
--
-- The liberar_reservas_expiradas() pg_cron sweep is paused for the
-- migration's duration so it cannot contend with the ACCESS EXCLUSIVE lock
-- phase (3) briefly takes, and lock_timeout is set so this migration fails
-- fast instead of queuing behind an in-flight reservar_numeros transaction.
--
-- No down-script ships for this file -- unlike 0006-0008, reversing a
-- primary-key swap on a live, actively-written table safely is materially
-- riskier than the additive/backfill migrations before it. Per the design
-- doc's rollback section, the accepted fallback for this step is snapshot
-- restore + redeploy of the previous commit (see step 1 of Migration /
-- Rollout: "DB snapshot. Non-negotiable.").

-- Pause the expiry sweep for the duration of this migration.
do $$
begin
  perform cron.unschedule('liberar-reservas-expiradas');
exception when others then
  raise notice 'Could not unschedule liberar-reservas-expiradas (may not exist in this environment): %', sqlerrm;
end $$;

-- Phase 1: build the new composite-key index without blocking readers/writers.
create unique index concurrently if not exists numeros_raffle_id_numero_idx on numeros (raffle_id, numero);

-- Phase 2: enforce raffle_id NOT NULL, validated before phase 3 touches the PK.
alter table numeros add constraint numeros_raffle_id_not_null check (raffle_id is not null) not valid;
alter table numeros validate constraint numeros_raffle_id_not_null;

-- Phase 3: catalog-only PK swap + new FKs (NOT VALID). See the header note
-- above for why this is a sequential run, not an explicit transaction block.
set lock_timeout = '5s';

alter table numeros drop constraint if exists numeros_pkey;
alter table numeros add constraint numeros_pkey primary key using index numeros_raffle_id_numero_idx;

alter table numeros add constraint numeros_raffle_id_fkey foreign key (raffle_id) references raffles(id) not valid;
alter table numeros add constraint numeros_organization_id_fkey foreign key (organization_id) references organizations(id) not valid;
alter table reservas add constraint reservas_raffle_id_fkey foreign key (raffle_id) references raffles(id) not valid;
alter table reservas add constraint reservas_organization_id_fkey foreign key (organization_id) references organizations(id) not valid;

alter table numeros drop column if exists numero_display;

-- Validate the new FKs in their own lighter-weight pass, outside the
-- ACCESS EXCLUSIVE window above.
alter table numeros validate constraint numeros_raffle_id_fkey;
alter table numeros validate constraint numeros_organization_id_fkey;
alter table reservas validate constraint reservas_raffle_id_fkey;
alter table reservas validate constraint reservas_organization_id_fkey;

-- Resume the expiry sweep now that the migration has completed. Same
-- permission caveat as 0001_init.sql: if pg_cron isn't available in this
-- environment, this is a no-op (already logged by the unschedule guard
-- above) rather than a hard failure of the whole migration.
do $sched$
begin
  perform cron.schedule('liberar-reservas-expiradas', '* * * * *', $$select liberar_reservas_expiradas();$$);
exception when others then
  raise notice 'Could not reschedule liberar-reservas-expiradas (pg_cron may be unavailable in this environment): %', sqlerrm;
end $sched$;
