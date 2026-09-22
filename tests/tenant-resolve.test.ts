import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchOrganizationByHost, fetchOrganizationBySubdomain } from "../lib/tenant/resolve";

// Integration test against the REAL local Postgres stack (see
// tests/reservar-numeros.test.ts for why) -- confirms the 0006-0009
// migrations actually produce a queryable `organizations` table and that
// the tenant-zero row seeded by 0008 resolves correctly, before any later
// phase builds middleware/Server Component code on top of it.

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient;

beforeAll(() => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

describe("fetchOrganizationBySubdomain", () => {
  it("resolves the tenant-zero organization seeded by 0008_tenant_zero_backfill.sql", async () => {
    const org = await fetchOrganizationBySubdomain(admin, "wilbermakia");

    expect(org).not.toBeNull();
    expect(org?.subdomain).toBe("wilbermakia");
    expect(org?.isPlatformOwner).toBe(true);
  });

  it("returns null for a subdomain with no matching organization", async () => {
    const org = await fetchOrganizationBySubdomain(admin, "does-not-exist-in-this-test-run");

    expect(org).toBeNull();
  });

  it("resolves a specific organization among several, not just the first row in the table", async () => {
    const { data: inserted, error } = await admin
      .from("organizations")
      .insert({
        subdomain: "tenant-resolve-test-acme",
        nombre: "Acme Test Org",
        subscription_status: "active",
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    const insertedId = (inserted as { id: string }).id;

    const org = await fetchOrganizationBySubdomain(admin, "tenant-resolve-test-acme");
    expect(org).not.toBeNull();
    expect(org?.id).toBe(insertedId);
    expect(org?.subdomain).toBe("tenant-resolve-test-acme");
    expect(org?.isPlatformOwner).toBe(false);

    // Cleanup: keep this suite re-runnable without `supabase db reset`.
    await admin.from("organizations").delete().eq("id", insertedId);
  });
});

describe("fetchOrganizationByHost", () => {
  it("resolves the apex host to the platform-owner organization, not by subdomain string", async () => {
    const org = await fetchOrganizationByHost(admin, "rifamakia.com");
    expect(org).not.toBeNull();
    expect(org?.isPlatformOwner).toBe(true);
  });

  it("resolves www.<apex> the same way as the bare apex", async () => {
    const org = await fetchOrganizationByHost(admin, "www.rifamakia.com");
    expect(org).not.toBeNull();
    expect(org?.isPlatformOwner).toBe(true);
  });

  it("resolves a tenant subdomain host to that specific organization", async () => {
    const { data: inserted, error } = await admin
      .from("organizations")
      .insert({ subdomain: "host-resolve-test-acme", nombre: "Acme Host Test", subscription_status: "active" })
      .select("id")
      .single();
    expect(error).toBeNull();
    const insertedId = (inserted as { id: string }).id;

    const org = await fetchOrganizationByHost(admin, "host-resolve-test-acme.rifamakia.com");
    expect(org).not.toBeNull();
    expect(org?.id).toBe(insertedId);
    expect(org?.isPlatformOwner).toBe(false);

    await admin.from("organizations").delete().eq("id", insertedId);
  });

  it("never resolves a reserved-word host to any organization", async () => {
    const org = await fetchOrganizationByHost(admin, "admin.rifamakia.com");
    expect(org).toBeNull();
  });

  it("returns null for an unknown tenant subdomain host", async () => {
    const org = await fetchOrganizationByHost(admin, "does-not-exist-anywhere.rifamakia.com");
    expect(org).toBeNull();
  });
});

afterAll(async () => {
  // No teardown of the local DB itself -- `npx supabase stop` tears down
  // the whole stack, matching the other integration test files.
});
