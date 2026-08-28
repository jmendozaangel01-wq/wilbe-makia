/**
 * Test-only environment setup.
 *
 * These integration tests run exclusively against a LOCAL Supabase stack
 * started with `npx supabase start` (real Postgres + PostgREST via Docker),
 * never against production. `supabase start` always prints the same
 * well-known, non-secret local-dev URL/keys for a fresh instance — they are
 * not secrets, but we still keep them out of committed source and only
 * reference the local instance here, never `.env.local` (which holds the
 * real project's production credentials).
 *
 * If your local stack was started with a customized `supabase/config.toml`
 * (different port, project id, etc.), override these via a gitignored
 * `.env.test.local` file or real environment variables before running the
 * tests — `npx supabase status` prints the values to use.
 */

process.env.TEST_SUPABASE_URL ??= "http://127.0.0.1:54321";

process.env.TEST_SUPABASE_ANON_KEY ??=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
