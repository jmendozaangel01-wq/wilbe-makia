import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * SSR Supabase client bound to the request's auth cookies. Respects RLS —
 * use this to check who's signed in, never for privileged writes (use
 * lib/supabase/admin.ts for those).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component — middleware refreshes the session instead.
          }
        },
      },
    }
  );
}
