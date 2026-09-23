import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthedUser, deleteTestUser } from "./helpers/auth";
import { cleanupOrg, createTestOrg } from "./helpers/fixtures";

// Where /admin sends a user whose requireAdminContext() call was denied.
// Before Phase 5 every denial went to /admin/login, which middleware bounces
// an authenticated user straight back from -- an infinite loop for a fresh
// Google user with no organization. Now: no session -> login; no membership
// anywhere -> onboarding; member elsewhere -> their own tenant; member of
// this very tenant (denied for another reason) -> login as before.

const mockState = vi.hoisted(() => ({
  client: null as SupabaseClient | null,
  host: "rifamakia.com",
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: mockState.host }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mockState.client,
}));
vi.mock("server-only", () => ({}));

const { getAdminDeniedRedirect } = await import("../lib/onboarding/admin-denied");

let admin: SupabaseClient;
const orgIds: string[] = [];
const userIds: string[] = [];

beforeAll(() => {
  admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

afterAll(async () => {
  for (const id of orgIds) await cleanupOrg(admin, id);
  for (const id of userIds) await deleteTestUser(id);
});

describe("getAdminDeniedRedirect", () => {
  it("sends an unauthenticated visitor to /admin/login", async () => {
    mockState.client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(await getAdminDeniedRedirect()).toBe("/admin/login");
  });

  it("sends an authenticated user with no organization to /onboarding", async () => {
    const user = await createAuthedUser("denied-none");
    userIds.push(user.userId);
    mockState.client = user.client;
    expect(await getAdminDeniedRedirect()).toBe("/onboarding");
  });

  it("sends a member of another tenant to their own tenant's admin", async () => {
    const user = await createAuthedUser("denied-other");
    userIds.push(user.userId);
    const org = await createTestOrg(admin, "denied-other");
    orgIds.push(org.id);
    await admin.from("organization_members").insert({ organization_id: org.id, user_id: user.userId, role: "owner" });

    mockState.client = user.client;
    mockState.host = "unrelated.rifamakia.com";
    expect(await getAdminDeniedRedirect()).toBe(`https://${org.subdomain}.rifamakia.com/admin`);
  });

  it("falls back to /admin/login for a member of the current tenant (denied for another reason)", async () => {
    const user = await createAuthedUser("denied-same");
    userIds.push(user.userId);
    const org = await createTestOrg(admin, "denied-same");
    orgIds.push(org.id);
    await admin.from("organization_members").insert({ organization_id: org.id, user_id: user.userId, role: "owner" });

    mockState.client = user.client;
    mockState.host = `${org.subdomain}.rifamakia.com`;
    expect(await getAdminDeniedRedirect()).toBe("/admin/login");
  });
});
