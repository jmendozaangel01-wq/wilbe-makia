-- Multi-tenant foundation, part 2 of 4. Adds nullable raffle_id/organization_id
-- to numeros and reservas. Nullable on purpose -- this keeps the live app
-- fully functional with zero behavior change; 0008 backfills every existing
-- row, and 0009 promotes raffle_id to NOT NULL + swaps the numeros PK once
-- the backfill is verified complete.
--
-- organization_id is denormalized here for auth-scope indexing/RLS even
-- though raffle_id -> raffles.organization_id already implies it (D1) -- a
-- trigger/CHECK keeping the two consistent is added in a later phase.
--
-- No foreign key constraints yet, deliberately -- FK creation is deferred to
-- 0009_tenant_constraints.sql, added there as NOT VALID + a separate
-- VALIDATE CONSTRAINT pass (see that file's header). Adding an inline
-- `references` here would create and validate the FK immediately, which
-- would collide with 0009 re-declaring the same (Postgres-auto-named)
-- constraint later -- keeping this migration purely additive (columns +
-- indexes, no constraints) matches the Migration/Rollout narrative: 0006-0008
-- are additive/backfill, 0009 alone handles constraint-tightening.

alter table numeros add column raffle_id uuid;
alter table numeros add column organization_id uuid;

alter table reservas add column raffle_id uuid;
alter table reservas add column organization_id uuid;

create index numeros_raffle_id_estado_idx on numeros (raffle_id, estado);
create index numeros_organization_id_idx on numeros (organization_id);

create index reservas_raffle_id_idx on reservas (raffle_id);
create index reservas_organization_id_idx on reservas (organization_id);
