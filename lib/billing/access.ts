/**
 * Canonical, provider-agnostic subscription-access decision (design D3,
 * Interfaces section: `hasActiveAccess()`). Mirrors org_access_active()
 * (supabase/migrations/0006_organizations.sql) in TypeScript:
 *
 *   is_platform_owner OR status = 'active' OR (status = 'trialing' AND
 *   trial_ends_at > now())
 *
 * Pure and I/O-free -- no "server-only" import, no next/headers dependency
 * -- so it's directly unit-testable (tests/subscription-gate.test.ts) and
 * safely importable from both requireAdminContext() (lib/auth/admin-context.ts,
 * the real security boundary -- Server Actions are directly invocable POST
 * endpoints) and middleware.ts (a UX-only redirect layer; see design D3:
 * "Enforced in two places... middleware.ts (UX redirect to /billing, not a
 * security boundary) and inside requireAdminContext() (the real boundary)").
 *
 * This supersedes lib/auth/access-check.ts, Phase 2's deliberately minimal
 * placeholder (platform-owner + active + unexpired-trialing only, per its
 * own header comment pointing at this exact file as the Phase 3 home). The
 * decision logic itself does not change from that placeholder -- it was
 * already a complete, correct mirror of org_access_active() -- only its
 * canonical location moves, per design's File Changes table row:
 * `lib/billing/access.ts | Create | Provider-agnostic gate helper mirroring
 * org_access_active`.
 *
 * Field naming: the design's Interfaces section sketches this as
 * `Pick<Organization, "is_platform_owner" | "subscription_status" |
 * "trial_ends_at">` (snake_case, matching raw Supabase column names). This
 * module uses camelCase instead, matching the ACTUAL shape callers already
 * have on hand: lib/tenant/resolve.ts's ResolvedOrganization (isPlatformOwner
 * / subscriptionStatus / trialEndsAt) is what both requireAdminContext() and
 * middleware.ts resolve tenants into, and no `Organization` type with raw
 * snake_case fields exists anywhere in the codebase to `Pick` from. Using
 * ResolvedOrganization's own field names here avoids a needless snake_case
 * <-> camelCase remapping step at every call site.
 */

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export interface OrgAccessFields {
  isPlatformOwner: boolean;
  subscriptionStatus: SubscriptionStatus;
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
