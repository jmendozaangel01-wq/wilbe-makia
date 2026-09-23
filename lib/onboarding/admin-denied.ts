import "server-only";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { loginErrorPath } from "@/lib/auth/login-errors";
import { resolvePostAuthDestination } from "./destination";

/**
 * Decides where /admin sends a request whose requireAdminContext() call was
 * denied. Middleware bounces an authenticated user from /admin/login back to
 * /admin, so sending everyone to the login page loops forever for a user who
 * is signed in but has no access to this tenant:
 * - no session -> /admin/login;
 * - signed in with no organization -> /onboarding (spec: first-time user is
 *   routed to creation);
 * - member of another tenant -> that tenant's admin;
 * - member of this very tenant, denied for another reason (e.g. lapsed
 *   subscription), or on an unrecognised host -> a terminal
 *   /admin/login?error=no_access that middleware does not bounce;
 * - membership lookup failure -> terminal /admin/login?error=lookup_failed
 *   instead of a 500.
 */
export async function getAdminDeniedRedirect(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return "/admin/login";
  }

  const headerList = await headers();
  const host = headerList.get("host") ?? "";

  try {
    const destination = await resolvePostAuthDestination(supabase, { host, next: "/admin" });
    return destination === "/admin" ? loginErrorPath("no_access") : destination;
  } catch (err) {
    console.error("[admin-denied] membership lookup failed", err);
    return loginErrorPath("lookup_failed");
  }
}
