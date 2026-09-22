import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createTestOrg, cleanupOrg, type TestOrg } from "./helpers/fixtures";

// Integration test for middleware.ts's subscription-gate wiring (Phase 3
// post-review, issue #3): tests/subscription-gate.test.ts only unit-tests
// the pure hasActiveAccess() decision -- this file exercises the exported
// middleware() function itself (resolve -> check -> redirect), the same way
// tests/admin-context.test.ts exercises requireAdminContext() end-to-end
// against real rows in local Postgres. "@supabase/ssr" is mocked because
// createServerClient() needs real cookie-jar plumbing this test doesn't
// have -- auth state is injected directly via mockState.user instead, which
// is the only thing middleware.ts actually reads off it (auth.getUser()).
// lib/tenant/resolve is mocked the same way tests/admin-context.test.ts
// mocks it: swap the service-role client construction for the TEST_SUPABASE_*
// admin client, but keep the real fetchOrganizationByHost() query logic.

const mockState = vi.hoisted(() => ({
  user: null as { id: string } | null,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockState.user } }),
    },
  }),
}));

vi.mock("@/lib/tenant/resolve", async () => {
  const actual = await vi.importActual<typeof import("../lib/tenant/resolve")>("../lib/tenant/resolve");
  const admin = createSupabaseClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    ...actual,
    resolveOrganizationByHost: (host: string) => actual.fetchOrganizationByHost(admin, host),
  };
});

const { middleware } = await import("../middleware");

describe("middleware subscription gate", () => {
  const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
  const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

  let admin: SupabaseClient;
  const createdOrgIds: string[] = [];

  beforeAll(() => {
    admin = createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterEach(() => {
    mockState.user = null;
  });

  afterAll(async () => {
    for (const orgId of createdOrgIds) {
      await cleanupOrg(admin, orgId);
    }
  });

  async function newOrg(tag: string, overrides: Parameters<typeof createTestOrg>[2] = {}): Promise<TestOrg> {
    const org = await createTestOrg(admin, tag, overrides);
    createdOrgIds.push(org.id);
    return org;
  }

  function hostFor(org: TestOrg): string {
    return `${org.subdomain}.rifamakia.com`;
  }

  function requestFor(org: TestOrg, pathname = "/admin"): NextRequest {
    const host = hostFor(org);
    return new NextRequest(`http://${host}${pathname}`, {
      headers: { host },
    });
  }

  it("redirects a signed-in admin of a lapsed-subscription org to /billing", async () => {
    const org = await newOrg("mw-lapsed", { subscriptionStatus: "past_due" });
    mockState.user = { id: "test-user" };

    const response = await middleware(requestFor(org));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/billing");
  });

  it("does not redirect a signed-in admin of an active-subscription org", async () => {
    const org = await newOrg("mw-active", { subscriptionStatus: "active" });
    mockState.user = { id: "test-user" };

    const response = await middleware(requestFor(org));

    expect(response.headers.get("location")).toBeNull();
  });

  it("does not redirect a signed-in admin still within an unexpired trial", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const org = await newOrg("mw-trialing", { subscriptionStatus: "trialing", trialEndsAt: future });
    mockState.user = { id: "test-user" };

    const response = await middleware(requestFor(org));

    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects to /admin/login instead of /billing when there is no signed-in user, even for a lapsed org", async () => {
    const org = await newOrg("mw-anon-lapsed", { subscriptionStatus: "past_due" });
    mockState.user = null;

    const response = await middleware(requestFor(org));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/admin/login");
  });
});
