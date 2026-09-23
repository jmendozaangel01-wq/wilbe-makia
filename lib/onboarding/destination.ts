import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSubdomain } from "../tenant/subdomain";
import { loginErrorPath } from "../auth/login-errors";
import { buildTenantAdminUrl, safeNextPath } from "./routing";

interface MembershipOrg {
  subdomain: string;
  is_platform_owner: boolean;
}

/**
 * Loads the caller's organizations through their own session (RLS:
 * members_read_own_membership + members_read_organizations, 0011), so this
 * can never surface another user's memberships.
 */
export async function fetchMemberOrganizations(supabase: Pick<SupabaseClient, "from">): Promise<MembershipOrg[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organizations(subdomain, is_platform_owner)");

  if (error) {
    throw error;
  }

  const orgs: MembershipOrg[] = [];
  for (const row of (data ?? []) as unknown as { organizations: MembershipOrg | MembershipOrg[] | null }[]) {
    const embedded = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    if (embedded) orgs.push(embedded);
  }
  return orgs;
}

/**
 * Where a freshly authenticated user should land (spec, tenant-onboarding):
 * - zero memberships -> the onboarding wizard (same host);
 * - a member whose current host already is one of their tenants -> `next`
 *   (default /admin) on this host;
 * - otherwise -> the admin area of their own tenant. Session cookies are
 *   host-scoped unless NEXT_PUBLIC_COOKIE_DOMAIN is set (see
 *   lib/supabase/cookie-options.ts), so cross-host hops need that env var in
 *   production for the session to follow the user;
 * - a member on an unrecognised host (no routable tenant URL) -> the terminal
 *   /admin/login?error=no_access page.
 */
export async function resolvePostAuthDestination(
  supabase: Pick<SupabaseClient, "from">,
  { host, next }: { host: string; next?: string | null }
): Promise<string> {
  const orgs = await fetchMemberOrganizations(supabase);

  if (orgs.length === 0) {
    return "/onboarding";
  }

  const parsed = parseSubdomain(host);
  const onOwnHost = orgs.some((org) =>
    parsed.kind === "tenant" ? org.subdomain === parsed.subdomain : parsed.kind === "apex" && org.is_platform_owner
  );

  if (onOwnHost) {
    return safeNextPath(next);
  }

  const tenantUrl = buildTenantAdminUrl(orgs[0].subdomain, host);
  // buildTenantAdminUrl() returns a relative path on unrecognised hosts
  // (e.g. Vercel previews), which would just re-enter /admin on a host where
  // this user is not a member and loop. End on a terminal page instead.
  return tenantUrl.startsWith("/") ? loginErrorPath("no_access") : tenantUrl;
}
