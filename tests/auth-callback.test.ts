import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthedUser, deleteTestUser } from "./helpers/auth";

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
afterAll(async () => {
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
});
