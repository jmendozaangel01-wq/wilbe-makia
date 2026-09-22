import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasActiveAccess } from "../lib/auth/access-check";
import { createAuthedUser, deleteTestUser, type AuthedTestUser } from "./helpers/auth";
import { createTestOrg, cleanupOrg, type TestOrg } from "./helpers/fixtures";

// Pure unit tests for the subscription-access decision used by
// requireAdminContext() (lib/auth/admin-context.ts). Kept in its own
// I/O-free module (lib/auth/access-check.ts) specifically so it's testable
// without next/headers or the "server-only" marker -- same pattern as
// lib/tenant/resolve.ts's fetchOrganizationBySubdomain split (Phase 1).
//
// Full trial/subscription enforcement is Phase 3 (lib/billing/access.ts,
// tasks 3.4-3.6); this covers what Phase 2's hard gate needs now: the
// platform-owner exemption plus the two straightforward subscription states.

// ---------------------------------------------------------------------------
// Integration tests for requireAdminContext() itself -- the actual security
// boundary this PR introduces (replacing the old "any authenticated user is
// admin" requireAdmin()). requireAdminContext() has hard dependencies on
// "server-only", next/headers, and the request-bound lib/supabase/server
// client, none of which exist outside a real Next.js request -- so those
// three are mocked below. Everything else (membership check, Host-based org
// resolution via fetchOrganizationByHost, the subscription gate) runs
// unmocked against real rows in local Postgres, using the same
// createAuthedUser/createTestOrg helpers tests/organizacion-rpc.test.ts and
// friends already rely on.
// ---------------------------------------------------------------------------

const mockState = vi.hoisted(() => ({
  host: "" as string,
  userClient: null as unknown,
}));

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(mockState.host ? { host: mockState.host } : {}),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mockState.userClient,
}));

vi.mock("@/lib/tenant/resolve", async () => {
  const actual = await vi.importActual<typeof import("../lib/tenant/resolve")>("../lib/tenant/resolve");
  // The real resolveOrganizationByHost() builds its own service-role client
  // from production env vars via lib/supabase/admin.ts. Swap in the
  // TEST_SUPABASE_* admin client instead, reusing the exact same
  // fetchOrganizationByHost() query logic tests/tenant-resolve.test.ts
  // exercises directly -- only the client construction changes.
  const admin = createSupabaseClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    ...actual,
    resolveOrganizationByHost: (host: string) => actual.fetchOrganizationByHost(admin, host),
  };
});

const { requireAdminContext, AdminContextError } = await import("../lib/auth/admin-context");

describe("requireAdminContext", () => {
  const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
  const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

  let admin: SupabaseClient;
  const createdOrgIds: string[] = [];
  const createdUsers: AuthedTestUser[] = [];

  beforeAll(() => {
    admin = createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterEach(() => {
    mockState.host = "";
    mockState.userClient = null;
  });

  afterAll(async () => {
    for (const orgId of createdOrgIds) {
      await cleanupOrg(admin, orgId);
    }
    for (const user of createdUsers) {
      await deleteTestUser(user.userId);
    }
  });

  async function newOrg(tag: string, overrides: Parameters<typeof createTestOrg>[2] = {}): Promise<TestOrg> {
    const org = await createTestOrg(admin, tag, overrides);
    createdOrgIds.push(org.id);
    return org;
  }

  async function newUser(tag: string): Promise<AuthedTestUser> {
    const user = await createAuthedUser(tag);
    createdUsers.push(user);
    return user;
  }

  async function addMembership(org: TestOrg, user: AuthedTestUser, role: "owner" | "admin"): Promise<void> {
    const { error } = await admin
      .from("organization_members")
      .insert({ organization_id: org.id, user_id: user.userId, role });
    if (error) throw error;
  }

  function hostFor(org: TestOrg): string {
    return `${org.subdomain}.rifamakia.com`;
  }

  it("denies when the caller has no membership row for the resolved organization", async () => {
    const org = await newOrg("no-membership");
    const user = await newUser("no-membership");

    mockState.host = hostFor(org);
    mockState.userClient = user.client;

    await expect(requireAdminContext()).rejects.toBeInstanceOf(AdminContextError);
  });

  it("denies when the caller is a member of a different organization than the Host resolves to", async () => {
    const hostOrg = await newOrg("wrong-org-host");
    const memberOrg = await newOrg("wrong-org-member");
    const user = await newUser("wrong-org");
    await addMembership(memberOrg, user, "owner");

    mockState.host = hostFor(hostOrg);
    mockState.userClient = user.client;

    await expect(requireAdminContext()).rejects.toBeInstanceOf(AdminContextError);
  });

  it("denies when the organization's subscription has lapsed and it is not the platform owner", async () => {
    const org = await newOrg("lapsed-sub", { subscriptionStatus: "past_due" });
    const user = await newUser("lapsed-sub");
    await addMembership(org, user, "owner");

    mockState.host = hostFor(org);
    mockState.userClient = user.client;

    await expect(requireAdminContext()).rejects.toBeInstanceOf(AdminContextError);
  });

  it("allows the platform owner regardless of its own subscription state", async () => {
    const { data: platformOrg, error } = await admin
      .from("organizations")
      .select("id, subdomain")
      .eq("is_platform_owner", true)
      .single();
    if (error || !platformOrg) throw error ?? new Error("Platform-owner org fixture (0008 seed) not found");

    const org = platformOrg as TestOrg;
    const user = await newUser("platform-owner");
    await addMembership(org, user, "owner");

    try {
      mockState.host = "rifamakia.com";
      mockState.userClient = user.client;

      const context = await requireAdminContext();
      expect(context.organizationId).toBe(org.id);
      expect(context.role).toBe("owner");
    } finally {
      await admin.from("organization_members").delete().eq("organization_id", org.id).eq("user_id", user.userId);
    }
  });

  it("returns the correct organizationId/raffleId/role on the happy path", async () => {
    const org = await newOrg("happy-path");
    const user = await newUser("happy-path");
    await addMembership(org, user, "admin");

    mockState.host = hostFor(org);
    mockState.userClient = user.client;

    const context = await requireAdminContext();
    expect(context.organizationId).toBe(org.id);
    expect(context.userId).toBe(user.userId);
    expect(context.role).toBe("admin");
    expect(context.raffleId).toBeNull();
  });
});

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
