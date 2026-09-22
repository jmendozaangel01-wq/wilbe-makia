/**
 * Pure, I/O-free subscription-access decision used by requireAdminContext()
 * (lib/auth/admin-context.ts). Split out into its own module -- with no
 * "server-only" import and no next/headers dependency -- specifically so it
 * can be unit tested directly, matching the pattern already used for
 * lib/tenant/resolve.ts's fetchOrganizationBySubdomain (Phase 1).
 *
 * Mirrors org_access_active() (supabase/migrations/0006_organizations.sql)
 * in TypeScript. Full trial/subscription enforcement is Phase 3
 * (lib/billing/access.ts, tasks 3.4-3.6); this covers what Phase 2's hard
 * gate needs now, per the spec's subscription-gating domain: the
 * platform-owner exemption plus the two straightforward subscription
 * states.
 */

export interface OrgAccessFields {
  isPlatformOwner: boolean;
  subscriptionStatus: "trialing" | "active" | "past_due" | "canceled";
  trialEndsAt: string | null;
}

export function hasActiveAccess(org: OrgAccessFields): boolean {
  if (org.isPlatformOwner) {
    return true;
  }

  if (org.subscriptionStatus === "active") {
    return true;
  }

  if (org.subscriptionStatus === "trialing" && org.trialEndsAt !== null) {
    return new Date(org.trialEndsAt).getTime() > Date.now();
  }

  return false;
}
