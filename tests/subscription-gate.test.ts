import { describe, expect, it } from "vitest";
import { hasActiveAccess } from "../lib/billing/access";

// Canonical unit-test home for the subscription-access decision (design
// Testing Strategy: "tests/subscription-gate.test.ts | Trial boundary,
// past_due, canceled, platform-owner exemption"). This supersedes the
// hasActiveAccess describe() block that temporarily lived in
// tests/admin-context.test.ts during Phase 2 -- that block imported from the
// now-removed lib/auth/access-check.ts (Phase 2's deliberately minimal
// placeholder, per its own header comment: "Full trial/subscription
// enforcement is Phase 3 (lib/billing/access.ts, tasks 3.4-3.6)"). Phase 3
// formalizes the canonical location design's File Changes table specifies
// (lib/billing/access.ts) and consolidates the tests here.

describe("hasActiveAccess", () => {
  it("grants access to the platform owner regardless of subscription state", () => {
    expect(hasActiveAccess({ isPlatformOwner: true, subscriptionStatus: "canceled", trialEndsAt: null })).toBe(true);
  });

  it("grants access to the platform owner even with an expired trial and no active subscription", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(hasActiveAccess({ isPlatformOwner: true, subscriptionStatus: "trialing", trialEndsAt: past })).toBe(true);
  });

  it("grants access when subscription_status is active", () => {
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "active", trialEndsAt: null })).toBe(true);
  });

  it("grants access when subscription_status is active even with a null trial_ends_at", () => {
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "active", trialEndsAt: null })).toBe(true);
  });

  it("grants access while within an unexpired trial window", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "trialing", trialEndsAt: future })).toBe(true);
  });

  it("grants access exactly at a trial boundary one second inside the window", () => {
    const justInside = new Date(Date.now() + 1_000).toISOString();
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "trialing", trialEndsAt: justInside })).toBe(
      true
    );
  });

  it("denies access exactly at a trial boundary one second past the window", () => {
    const justOutside = new Date(Date.now() - 1_000).toISOString();
    expect(
      hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "trialing", trialEndsAt: justOutside })
    ).toBe(false);
  });

  it("denies access when the trial has expired", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "trialing", trialEndsAt: past })).toBe(
      false
    );
  });

  it("denies access for past_due", () => {
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "past_due", trialEndsAt: null })).toBe(
      false
    );
  });

  it("denies access for past_due even with a future trial_ends_at (subscription state wins)", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "past_due", trialEndsAt: future })).toBe(
      false
    );
  });

  it("denies access for canceled", () => {
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "canceled", trialEndsAt: null })).toBe(
      false
    );
  });

  it("denies access for trialing with a null trial_ends_at (malformed data, fail closed)", () => {
    expect(hasActiveAccess({ isPlatformOwner: false, subscriptionStatus: "trialing", trialEndsAt: null })).toBe(
      false
    );
  });
});
