import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser, deleteTestUser } from "./helpers/auth";

// Proves crear_organizacion (design D2's Interfaces / Onboarding section):
// the new org's id is always generated server-side -- never accepted as a
// client-suppliable parameter -- and concurrent calls from different users
// always yield two distinct organizations, each owned by its actual caller.
// Requires 0010_tenant_rpcs.sql (RED until then).

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient;
const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

beforeAll(() => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
});

afterAll(async () => {
  for (const orgId of createdOrgIds) {
    await admin.from("organization_members").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
  for (const userId of createdUserIds) {
    await deleteTestUser(userId);
  }
});

describe("crear_organizacion", () => {
  it("has no client-suppliable organization_id parameter (PostgREST rejects the extra param)", async () => {
    const { error } = await admin.rpc("crear_organizacion", {
      p_nombre: "Should Not Work",
      p_subdomain: `should-not-work-${Date.now()}`,
      // No such parameter exists on the function signature -- PostgREST
      // fails to resolve a matching overload when it's supplied.
      p_organization_id: "00000000-0000-0000-0000-000000000000",
    } as Record<string, unknown>);

    expect(error).not.toBeNull();
  });

  it("rejects a call with no authenticated caller (auth.uid() is null)", async () => {
    const { error } = await admin.rpc("crear_organizacion", {
      p_nombre: "No Caller",
      p_subdomain: `no-caller-${Date.now()}`,
    });

    // Called via the service-role client directly (no user JWT), so
    // auth.uid() is null inside the function -- must be rejected, not
    // silently create an org with no owner.
    expect(error).not.toBeNull();
  });

  it("two concurrent calls from different users always yield two distinct organizations", async () => {
    const [userA, userB] = await Promise.all([createAuthedUser("crear-org-a"), createAuthedUser("crear-org-b")]);
    createdUserIds.push(userA.userId, userB.userId);

    const subdomainA = `concurrent-org-a-${Date.now()}`;
    const subdomainB = `concurrent-org-b-${Date.now()}`;

    const [resultA, resultB] = await Promise.all([
      userA.client.rpc("crear_organizacion", { p_nombre: "Org A", p_subdomain: subdomainA }),
      userB.client.rpc("crear_organizacion", { p_nombre: "Org B", p_subdomain: subdomainB }),
    ]);

    expect(resultA.error).toBeNull();
    expect(resultB.error).toBeNull();

    const orgIdA = (resultA.data as { organization_id: string }[])[0].organization_id;
    const orgIdB = (resultB.data as { organization_id: string }[])[0].organization_id;
    createdOrgIds.push(orgIdA, orgIdB);

    expect(orgIdA).not.toBe(orgIdB);

    const { data: memberA } = await admin
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", orgIdA)
      .single();
    const { data: memberB } = await admin
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", orgIdB)
      .single();

    expect((memberA as { user_id: string }).user_id).toBe(userA.userId);
    expect((memberA as { role: string }).role).toBe("owner");
    expect((memberB as { user_id: string }).user_id).toBe(userB.userId);
    expect((memberB as { role: string }).role).toBe("owner");
  });
});
