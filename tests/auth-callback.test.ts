import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAuthedUser, deleteTestUser } from "./helpers/auth";
import { cleanupOrg, createTestOrg } from "./helpers/fixtures";

// OAuth callback route (Phase 5): exchanges the Google auth code for a
// session, then routes by membership. The Supabase SSR client is faked so
// exchangeCodeForSession() needs no real Google round trip; membership reads
// still hit local Postgres under a real user's JWT.

const mockState = vi.hoisted(() => ({
  exchangeError: null as { message: string } | null,
  exchangeCalls: [] as string[],
  memberClient: null as SupabaseClient | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async (code: string) => {
        mockState.exchangeCalls.push(code);
        return { error: mockState.exchangeError };
      },
      getUser: async () => mockState.memberClient!.auth.getUser(),
    },
    from: (table: string) => mockState.memberClient!.from(table),
  }),
}));

const { GET } = await import("../app/auth/callback/route");

const userIds: string[] = [];
const orgIds: string[] = [];
const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
afterAll(async () => {
  for (const id of orgIds) await cleanupOrg(admin, id);
  for (const id of userIds) await deleteTestUser(id);
});

function callbackRequest(query: string): NextRequest {
  return new NextRequest(`http://rifamakia.com/auth/callback${query}`, { headers: { host: "rifamakia.com" } });
}

describe("GET /auth/callback", () => {
  it("redirects to login with an error when the code is missing", async () => {
    const res = await GET(callbackRequest(""));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/admin/login");
  });

  it("redirects to login with an error when the code exchange fails", async () => {
    mockState.exchangeError = { message: "bad code" };
    const res = await GET(callbackRequest("?code=abc"));
    mockState.exchangeError = null;
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("error")).toBeTruthy();
  });

  it("sends a brand-new user (no membership) to /onboarding", async () => {
    const user = await createAuthedUser("cb-new");
    userIds.push(user.userId);
    mockState.memberClient = user.client;
    mockState.exchangeCalls.length = 0;

    const res = await GET(callbackRequest("?code=good-code"));
    expect(mockState.exchangeCalls).toEqual(["good-code"]);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/onboarding");
  });

  it("never redirects off-origin via the next parameter", async () => {
    const user = await createAuthedUser("cb-next");
    userIds.push(user.userId);
    mockState.memberClient = user.client;

    const res = await GET(callbackRequest("?code=good-code&next=//evil.example"));
    const location = new URL(res.headers.get("location")!);
    expect(location.host).toBe("rifamakia.com");
  });

  it.each([
    ["tab", "%2F%09%2Fevil.example"],
    ["line feed", "%2F%0A%2Fevil.example"],
    ["carriage return", "%2F%0D%2Fevil.example"],
    ["encoded backslash", "%2F%5Cevil.example"],
  ])("never redirects off-origin via a control-char next (%s)", async (_label, encoded) => {
    // Member on their own tenant host, so `next` is actually honoured.
    const user = await createAuthedUser("cb-ctl");
    userIds.push(user.userId);
    const org = await createTestOrg(admin, "cb-ctl");
    orgIds.push(org.id);
    await admin.from("organization_members").insert({ organization_id: org.id, user_id: user.userId, role: "owner" });
    mockState.memberClient = user.client;

    const host = `${org.subdomain}.rifamakia.com`;
    const req = new NextRequest(`http://${host}/auth/callback?code=good-code&next=${encoded}`, { headers: { host } });
    const res = await GET(req);
    const location = new URL(res.headers.get("location")!);
    expect(location.host).toBe(host);
  });
});
