import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser, deleteTestUser } from "./helpers/auth";
import { cleanupOrg, createTestOrg } from "./helpers/fixtures";
import { resolvePostAuthDestination } from "../lib/onboarding/destination";

// Where a freshly authenticated user lands: zero memberships -> onboarding
// wizard; existing members -> their own tenant's admin (spec: "First-time
// user with no organization is routed to creation" / "Existing member
// bypasses creation"). Uses real users + RLS (the SSR client in production
// reads memberships under the caller's own JWT, exactly like these clients).

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

async function memberOf(tag: string, opts: { platformOwner?: boolean } = {}) {
  const user = await createAuthedUser(tag);
  userIds.push(user.userId);
  const org = await createTestOrg(admin, tag, { isPlatformOwner: opts.platformOwner });
  orgIds.push(org.id);
  await admin.from("organization_members").insert({ organization_id: org.id, user_id: user.userId, role: "owner" });
  return { user, org };
}

describe("resolvePostAuthDestination", () => {
  it("routes a user with zero memberships to /onboarding", async () => {
    const user = await createAuthedUser("dest-none");
    userIds.push(user.userId);
    expect(await resolvePostAuthDestination(user.client, { host: "benditarifa.com", next: "/admin" })).toBe(
      "/onboarding"
    );
  });

  it("keeps a member on the current tenant host and honours next", async () => {
    const { user, org } = await memberOf("dest-own");
    const host = `${org.subdomain}.benditarifa.com`;
    expect(await resolvePostAuthDestination(user.client, { host, next: "/admin" })).toBe("/admin");
  });

  it("sends a member arriving on the wrong host to their own tenant's admin", async () => {
    const { user, org } = await memberOf("dest-wrong");
    expect(await resolvePostAuthDestination(user.client, { host: "someone-else.benditarifa.com", next: "/admin" })).toBe(
      `https://${org.subdomain}.benditarifa.com/admin`
    );
  });

  it("sends a non-owner member on an unrecognised host (e.g. a Vercel preview) to the terminal no-access page", async () => {
    const { user } = await memberOf("dest-preview");
    expect(
      await resolvePostAuthDestination(user.client, { host: "my-app-git-branch.vercel.app", next: "/admin" })
    ).toBe("/admin/login?error=no_access");
  });

  it("uses http + port for local dev hosts", async () => {
    const { user, org } = await memberOf("dest-local");
    expect(await resolvePostAuthDestination(user.client, { host: "localhost:3000", next: "/admin" })).toBe(
      `http://${org.subdomain}.localhost:3000/admin`
    );
  });
});
