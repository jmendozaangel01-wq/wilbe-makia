import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAuthedUser, deleteTestUser, type AuthedTestUser } from "./helpers/auth";
import { cleanupOrg, createTestOrg, type TestOrg } from "./helpers/fixtures";

// getComprobanteUrl (app/admin/actions.ts) has hard dependencies on
// "server-only", next/headers, the request-bound lib/supabase/server client,
// and lib/supabase/admin's service-role client construction (which reads
// production env var names) -- all mocked below, same pattern as
// tests/admin-context.test.ts. requireAdminContext() itself runs unmocked
// against real rows in local Postgres.
//
// Per design D2 (and confirmed already implemented in Phase 2, task 2.12):
// getComprobanteUrl takes a reservaId (never a raw storage path), looks up
// the reserva's stored comprobante_url scoped by organization_id, and signs
// it VERBATIM -- it never reconstructs a path from organization_id +
// filename. This is what makes a pre-migration (unprefixed) receipt keep
// resolving with zero backfill, and what makes a foreign-org reservaId
// resolve to zero rows instead of leaking another tenant's receipt.

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

vi.mock("@/lib/supabase/admin", () => {
  const admin = createSupabaseClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { createAdminClient: () => admin };
});

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

const { getComprobanteUrl } = await import("../app/admin/actions");

describe("getComprobanteUrl", () => {
  const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
  const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

  let admin: SupabaseClient;
  const createdOrgIds: string[] = [];
  const createdUsers: AuthedTestUser[] = [];
  const uploadedPaths: string[] = [];

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
    if (uploadedPaths.length > 0) {
      await admin.storage.from("comprobantes").remove(uploadedPaths);
    }
    for (const orgId of createdOrgIds) {
      await cleanupOrg(admin, orgId);
    }
    for (const user of createdUsers) {
      await deleteTestUser(user.userId);
    }
  });

  async function newOrg(tag: string): Promise<TestOrg> {
    const org = await createTestOrg(admin, tag);
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

  async function uploadComprobante(path: string): Promise<void> {
    const { error } = await admin.storage
      .from("comprobantes")
      .upload(path, new Uint8Array([1, 2, 3, 4]), { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    uploadedPaths.push(path);
  }

  async function createReserva(organizationId: string, comprobanteUrl: string): Promise<string> {
    const { data, error } = await admin
      .from("reservas")
      .insert({
        organization_id: organizationId,
        nombre: "Test",
        apellido: "Buyer",
        correo: `buyer-${Date.now()}-${Math.random()}@example.com`,
        whatsapp: "3000000000",
        direccion: "Calle Falsa 123",
        ciudad: "Cartagena",
        paquete_tipo: "custom",
        numeros_asignados: [0],
        comprobante_url: comprobanteUrl,
        estado: "en_verificacion",
        expira_en: new Date(Date.now() + 10 * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  it("rejects a reservaId belonging to a foreign organization instead of signing its receipt", async () => {
    const orgA = await newOrg("comprobante-a");
    const orgB = await newOrg("comprobante-b");
    const userA = await newUser("comprobante-a");
    await addMembership(orgA, userA, "owner");

    // Upload a REAL object -- proves the rejection is the organization_id
    // scoping in the query, not merely a missing-file 404 from createSignedUrl.
    const path = `${orgB.id}/foreign-org-receipt-${Date.now()}.jpg`;
    await uploadComprobante(path);
    const reservaId = await createReserva(orgB.id, path);

    mockState.host = hostFor(orgA);
    mockState.userClient = userA.client;

    const result = await getComprobanteUrl(reservaId);
    expect(result.ok).toBe(false);
  });

  it("a pre-migration (unprefixed-path) receipt is still retrievable through the same flow", async () => {
    const org = await newOrg("comprobante-legacy");
    const user = await newUser("comprobante-legacy");
    await addMembership(org, user, "owner");

    // Flat filename, no {organization_id}/ prefix -- simulates a receipt
    // uploaded before this batch's storage-path prefixing (task 4.9) existed.
    const path = `legacy-${Date.now()}.jpg`;
    await uploadComprobante(path);
    const reservaId = await createReserva(org.id, path);

    mockState.host = hostFor(org);
    mockState.userClient = user.client;

    const result = await getComprobanteUrl(reservaId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBeTruthy();
      expect(result.url).toContain("comprobantes");
    }
  });

  it("rejects when the caller has no membership in the resolved organization at all", async () => {
    const org = await newOrg("comprobante-no-membership");
    const user = await newUser("comprobante-no-membership");
    // Deliberately no addMembership() call.

    const path = `no-membership-${Date.now()}.jpg`;
    await uploadComprobante(path);
    const reservaId = await createReserva(org.id, path);

    mockState.host = hostFor(org);
    mockState.userClient = user.client;

    await expect(getComprobanteUrl(reservaId)).rejects.toThrow();
  });
});
