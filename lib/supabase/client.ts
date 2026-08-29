import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client, bound to the signed-in admin's session cookie.
 * Respects RLS (see supabase/migrations/0004_admin_panel.sql for the
 * authenticated-read policies) — never use this for privileged writes.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
