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
