# Rifa Makia

Raffle-reservation site for Wilber Makia's raffle, built with Next.js 15 (App Router) and Supabase.

## Environment variables

Copy `.env.example` to `.env.local` and fill in real values:

- `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role key (server-only, never expose to the client)
- `RESEND_API_KEY` — Resend API key used to send confirmation emails

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

### Database

The SQL files in `supabase/migrations/` must be run manually, in order, in the Supabase SQL editor (there is no migration runner wired up yet):

1. `0001_init.sql`
2. `0002_storage.sql`

`0001_init.sql` enables `pg_cron` to schedule the reservation-expiry sweep. If `create extension if not exists pg_cron;` fails due to permissions, enable the `pg_cron` extension manually via **Supabase Dashboard → Database → Extensions**, then re-run just the `select cron.schedule(...)` statement at the bottom of that file.

## Integration tests

`tests/reservar-numeros.test.ts` runs real concurrency and access-control checks against a REAL local Postgres (via the Supabase CLI + Docker) — not a JS-based emulator, since those don't correctly model `FOR UPDATE SKIP LOCKED` row locking under concurrent load. It proves the core money-safety guarantee: concurrent reservations never assign the same raffle number twice.

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) running.

```bash
npx supabase start   # boots local Postgres + PostgREST, applies supabase/migrations/ automatically
npm test              # runs vitest against the local stack (never against production)
npx supabase stop     # tears down the local containers when you're done
```

The test suite talks only to the local instance printed by `npx supabase start` / `npx supabase status` — see `tests/setup.ts` for the (non-secret, well-known) local-dev defaults it falls back to. It never reads `.env.local` or touches production.
