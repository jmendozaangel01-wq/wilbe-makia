import { describe, expect, it } from "vitest";
import { hasActiveAccess } from "../lib/auth/access-check";

// Pure unit tests for the subscription-access decision used by
// requireAdminContext() (lib/auth/admin-context.ts). Kept in its own
// I/O-free module (lib/auth/access-check.ts) specifically so it's testable
// without next/headers or the "server-only" marker -- same pattern as
// lib/tenant/resolve.ts's fetchOrganizationBySubdomain split (Phase 1).
//
// Full trial/subscription enforcement is Phase 3 (lib/billing/access.ts,
// tasks 3.4-3.6); this covers what Phase 2's hard gate needs now: the
// platform-owner exemption plus the two straightforward subscription states.

describe("hasActiveAccess", () => {
  it("grants access to the platform owner regardless of subscription state", () => {
    expect(hasActiveAccess({ isPlatformOwner: true, subscriptionStatus: "canceled", trialEndsAt: null })).toBe(true);
  });

  it("grants access when subscription_status is active", () => {
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "active", trialEndsAt: null })).toBe(true);
  });

  it("grants access while within an unexpired trial window", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "trialing", trialEndsAt: future })).toBe(true);
  });

  it("denies access when the trial has expired", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "trialing", trialEndsAt: past })).toBe(false);
  });

  it("denies access for past_due", () => {
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "past_due", trialEndsAt: null })).toBe(false);
  });

  it("denies access for canceled", () => {
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "canceled", trialEndsAt: null })).toBe(false);
  });

  it("denies access for trialing with a null trial_ends_at (malformed data, fail closed)", () => {
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "trialing", trialEndsAt: null })).toBe(false);
  });
});
