import "server-only";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
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
 *   subscription) -> /admin/login, the pre-existing behavior.
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

  const destination = await resolvePostAuthDestination(supabase, { host, next: "/admin" });
  return destination === "/admin" ? "/admin/login" : destination;
}
