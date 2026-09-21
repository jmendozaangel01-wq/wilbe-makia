-- Multi-tenant foundation, part 1 of 4 (0006-0009). Introduces the tenant
-- root entity (organizations), membership mapping, and the raffle entity
-- that will replace the single global raffle pool. This migration is purely
-- additive -- it creates new tables only, it does not touch numeros/reservas.
--
-- Tenant hierarchy: organizations -> raffles -> numeros/reservas (see design
-- doc D1). organization_id is the auth/billing scope; raffle_id is the
-- number-pool scope, added separately in 0007.

create table organizations (
  id uuid primary key default gen_random_uuid(),
  subdomain text not null unique,
  nombre text not null,
  logo_url text,
  color_primario text,
  is_platform_owner boolean not null default false,
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_ends_at timestamptz,
  -- opaque provider identifiers -- no gate logic reads these directly (see D3);
  -- a future billing webhook only ever writes subscription_status/trial_ends_at
  billing_provider text,
  billing_customer_id text,
  billing_subscription_id text,
  creado_en timestamptz not null default now()
);

-- exactly one tenant can be the platform owner (D4) -- enforced by the DB,
-- not by convention or a hardcoded id/email anywhere in application code
create unique index organizations_one_platform_owner_idx on organizations (is_platform_owner) where is_platform_owner;

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin')),
  creado_en timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- raffle lifecycle: borrador (draft) -> activa -> cerrada -> archivada.
-- number-range/price/package/blessed-number/sorteo/buyer-payment
-- configuration replaces the global constants in lib/constants.ts (see
-- raffle-configuration domain) -- columns are seeded from those exact
-- current values for the tenant-zero raffle in 0008.
create table raffles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  nombre text not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'activa', 'cerrada', 'archivada')),
  max_numero integer not null check (max_numero >= 0 and max_numero <= 99999),
  precio_por_numero integer not null check (precio_por_numero > 0),
  paquetes jsonb not null default '[]'::jsonb,
  numeros_bendecidos integer[] not null default '{}',
  sorteo_fecha text not null,
  nequi_numero text not null,
  nequi_nombre text not null,
  creado_en timestamptz not null default now()
);

-- one open (borrador or activa) raffle per organization at a time (D5) --
-- crear_rifa() fails by constraint, not by a race-prone app-level check.
-- Closing a raffle (activa -> cerrada) unlocks creation of the next one.
create unique index one_open_raffle on raffles (organization_id) where estado in ('borrador', 'activa');

-- RLS: default-deny, matching the convention already used for numeros/reservas
-- in 0001_init.sql -- enable RLS with zero policies. All reads/writes go
-- through the service-role client (lib/supabase/admin.ts) or SECURITY
-- DEFINER RPCs until a later phase introduces a concrete authenticated
-- direct-read need (e.g. admin panel branding UI), at which point a
-- narrowly-scoped SELECT policy can be added.
--
-- organization_members specifically: no INSERT/UPDATE RLS policy for
-- authenticated or anon exists, or ever will by default -- all writes to
-- membership happen exclusively through SECURITY DEFINER RPCs (crear_organizacion
-- and any future invite RPC), never direct client writes.
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table raffles enable row level security;

-- Provider-agnostic active-access check (D3): true if the org is the
-- platform owner, has an active subscription, or is within its trial
-- window. SECURITY DEFINER so it can be called from other SECURITY DEFINER
-- RPCs regardless of caller, but execute is restricted to service-role only
-- (same pattern as every other RPC in this schema) -- it is an internal
-- helper, not meant for direct client invocation.
create or replace function org_access_active(p_organization_id uuid) returns boolean
language sql stable security definer as $$
  select coalesce(
    (
      select is_platform_owner
          or subscription_status = 'active'
          or (subscription_status = 'trialing' and trial_ends_at > now())
      from organizations
      where id = p_organization_id
    ),
    false
  );
$$;

revoke execute on function org_access_active(uuid) from public, anon, authenticated;
