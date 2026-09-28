import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAuthedUser, deleteTestUser, type AuthedTestUser } from "./helpers/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestOrg, createTestRaffle, cleanupOrg, type TestOrg, type TestRaffle } from "./helpers/fixtures";

// updateRaffleConfig (app/admin/config-actions.ts): the tenant admin's raffle
// configuration save. Same mocking approach as tests/admin-context.test.ts --
// requireAdminContext()'s hard dependencies (server-only, next/headers,
// lib/supabase/server, lib/tenant/resolve's service-role client) are faked;
// everything else (membership, validation, the actualizar_rifa RPC, Storage)
// runs unmocked against real local Postgres/Storage.

const mockState = vi.hoisted(() => ({
  host: "" as string,
  userClient: null as unknown,
}));

const revalidate = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
// revalidatePath throws outside a Next request context, so the action's call to
// it needs a stand-in here; it is also what the tests below assert on.
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
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

const { updateRaffleConfig } = await import("../app/admin/config-actions");

describe("updateRaffleConfig", () => {
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
    for (const orgId of createdOrgIds) await cleanupOrg(admin, orgId);
    for (const user of createdUsers) await deleteTestUser(user.userId);
  });

  async function setup(tag: string): Promise<{ org: TestOrg; raffle: TestRaffle; user: AuthedTestUser }> {
    const org = await createTestOrg(admin, tag);
    createdOrgIds.push(org.id);
    const raffle = await createTestRaffle(admin, org.id, tag);
    const user = await createAuthedUser(tag);
    createdUsers.push(user);
    await admin.from("organization_members").insert({ organization_id: org.id, user_id: user.userId, role: "owner" });
    return { org, raffle, user };
  }

  function activate(org: TestOrg, user: AuthedTestUser) {
    mockState.host = `${org.subdomain}.benditarifa.com`;
    mockState.userClient = user.client;
  }

  function form(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData();
    const fields: Record<string, string> = {
      raffleName: "Rifa actualizada",
      precioPorNumero: "500",
      sorteoFecha: "20 NOV 2026",
      nequiNumero: "3009998888",
      nequiNombre: "Nuevo Titular",
      numerosBendecidos: "1,2,3",
      ...overrides,
    };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  it("saves valid input and leaves logo_url/qr_url untouched with no file, echoing the existing values back for display", async () => {
    const { org, raffle, user } = await setup("save-ok");
    await admin.from("organizations").update({ logo_url: "https://example.com/keep.png" }).eq("id", org.id);
    await admin.from("raffles").update({ qr_url: "https://example.com/keep-qr.png" }).eq("id", raffle.id);
    activate(org, user);
    revalidate.mockClear();

    const result = await updateRaffleConfig({ status: "idle" }, form());
    expect(result.status).toBe("success");
    // The admin page passes the raffle's blessed numbers down as props, so a
    // save must refresh it or the Reservas/Numeros tabs keep the old list.
    expect(revalidate).toHaveBeenCalledWith("/admin");
    if (result.status === "success") {
      // Regression: this action used to return null here whenever no new
      // file was uploaded, even though the DB still had a logo/QR -- the
      // admin form would then wrongly show "sin logo" right after a
      // successful save that only touched an unrelated field.
      expect(result.logoUrl).toBe("https://example.com/keep.png");
      expect(result.qrUrl).toBe("https://example.com/keep-qr.png");
    }

    const { data: row } = await admin.from("raffles").select("nombre, precio_por_numero, max_numero").eq("id", raffle.id).single();
    expect(row).toMatchObject({ nombre: "Rifa actualizada", precio_por_numero: 500, max_numero: raffle.maxNumero });

    const { data: org2 } = await admin.from("organizations").select("logo_url").eq("id", org.id).single();
    expect(org2!.logo_url).toBe("https://example.com/keep.png");
  });

  it("returns field errors without calling the RPC for invalid input", async () => {
    const { org, raffle, user } = await setup("save-invalid");
    activate(org, user);
    revalidate.mockClear();

    const result = await updateRaffleConfig({ status: "idle" }, form({ nequiNumero: "123" }));
    expect(result.status).toBe("error");
    expect(revalidate).not.toHaveBeenCalled();
    if (result.status === "error") {
      expect(result.fieldErrors.nequiNumero).toBeDefined();
    }

    const { data: row } = await admin.from("raffles").select("nequi_numero").eq("id", raffle.id).single();
    expect(row!.nequi_numero).toBe("3000000000"); // fixture default, unchanged
  });

  it("rejects a blessed number outside the raffle's max_numero", async () => {
    const { org, raffle, user } = await setup("save-blessed-oob");
    activate(org, user);

    const result = await updateRaffleConfig(
      { status: "idle" },
      form({ numerosBendecidos: `${raffle.maxNumero + 1}` })
    );
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.fieldErrors.numerosBendecidos).toBeDefined();
  });

  it("uploads a valid logo image and persists its public URL", async () => {
    const { org, user } = await setup("save-logo");
    activate(org, user);

    const fd = form();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    fd.set("logo", new File([pngBytes], "logo.png", { type: "image/png" }));

    const result = await updateRaffleConfig({ status: "idle" }, fd);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.logoUrl).toContain("/storage/v1/object/public/logos/");
    }

    const { data: org2 } = await admin.from("organizations").select("logo_url").eq("id", org.id).single();
    expect(org2!.logo_url).toContain("/storage/v1/object/public/logos/");

    if (result.status === "success" && result.logoUrl) {
      const path = result.logoUrl.split("/logos/")[1];
      await admin.storage.from("logos").remove([path]);
    }
  });

  it("stores the extension from the detected byte signature, not the client-supplied filename", async () => {
    const { org, user } = await setup("save-logo-spoofed-name");
    activate(org, user);

    const fd = form();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    // Client lies about both the filename extension and the MIME type; only
    // the real PNG signature should decide what gets stored.
    fd.set("logo", new File([pngBytes], "evil.html", { type: "text/html" }));

    const result = await updateRaffleConfig({ status: "idle" }, fd);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.logoUrl).toMatch(/\.png$/);
    }

    if (result.status === "success" && result.logoUrl) {
      const path = result.logoUrl.split("/logos/")[1];
      await admin.storage.from("logos").remove([path]);
    }
  });

  it("rejects a logo larger than the size limit before reading its bytes", async () => {
    const { org, user } = await setup("save-logo-too-big");
    activate(org, user);

    const fd = form();
    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    fd.set("logo", new File([oversized], "logo.png", { type: "image/png" }));

    const result = await updateRaffleConfig({ status: "idle" }, fd);
    expect(result.status).toBe("error");

    const { data: org2 } = await admin.from("organizations").select("logo_url").eq("id", org.id).single();
    expect(org2!.logo_url).toBeNull();
  });

  it("rejects a logo file that isn't a real image regardless of its extension/MIME", async () => {
    const { org, user } = await setup("save-fake-logo");
    activate(org, user);

    const fd = form();
    fd.set("logo", new File([new Uint8Array([1, 2, 3, 4])], "logo.png", { type: "image/png" }));

    const result = await updateRaffleConfig({ status: "idle" }, fd);
    expect(result.status).toBe("error");

    const { data: org2 } = await admin.from("organizations").select("logo_url").eq("id", org.id).single();
    expect(org2!.logo_url).toBeNull();
  });

  it("uploads a valid QR image and persists its public URL, independently of the logo", async () => {
    const { org, raffle, user } = await setup("save-qr");
    activate(org, user);

    const fd = form();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    fd.set("qr", new File([pngBytes], "qr.png", { type: "image/png" }));

    const result = await updateRaffleConfig({ status: "idle" }, fd);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.qrUrl).toContain("/storage/v1/object/public/logos/");
      expect(result.logoUrl).toBeNull();
    }

    const { data: row } = await admin.from("raffles").select("qr_url").eq("id", raffle.id).single();
    expect(row!.qr_url).toContain("/storage/v1/object/public/logos/");

    if (result.status === "success" && result.qrUrl) {
      const path = result.qrUrl.split("/logos/")[1];
      await admin.storage.from("logos").remove([path]);
    }
  });

  it("uploads both logo and QR in the same submit without them colliding in storage", async () => {
    const { org, raffle, user } = await setup("save-logo-and-qr");
    activate(org, user);

    const fd = form();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    fd.set("logo", new File([pngBytes], "logo.png", { type: "image/png" }));
    fd.set("qr", new File([pngBytes], "qr.png", { type: "image/png" }));

    const result = await updateRaffleConfig({ status: "idle" }, fd);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.logoUrl).toBeTruthy();
      expect(result.qrUrl).toBeTruthy();
      expect(result.logoUrl).not.toBe(result.qrUrl);

      const cleanupPaths = [result.logoUrl, result.qrUrl].map((u) => u!.split("/logos/")[1]);
      await admin.storage.from("logos").remove(cleanupPaths);
    }

    const { data: row } = await admin.from("raffles").select("qr_url").eq("id", raffle.id).single();
    expect(row!.qr_url).toBe(result.status === "success" ? result.qrUrl : undefined);
  });

  it("rejects a QR file that isn't a real image and rolls back an already-uploaded logo from the same submit", async () => {
    const { org, user } = await setup("save-bad-qr-rollback");
    activate(org, user);

    const fd = form();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    fd.set("logo", new File([pngBytes], "logo.png", { type: "image/png" }));
    fd.set("qr", new File([new Uint8Array([1, 2, 3, 4])], "qr.png", { type: "image/png" }));

    const result = await updateRaffleConfig({ status: "idle" }, fd);
    expect(result.status).toBe("error");

    const { data: org2 } = await admin.from("organizations").select("logo_url").eq("id", org.id).single();
    expect(org2!.logo_url).toBeNull();
  });

  it("fails closed instead of treating a failed organizations lookup as 'no existing logo'", async () => {
    const { org, raffle, user } = await setup("save-org-lookup-fails");
    await admin.from("organizations").update({ logo_url: "https://example.com/keep.png" }).eq("id", org.id);
    activate(org, user);

    const mockedAdmin = createAdminClient();
    const realFrom = mockedAdmin.from.bind(mockedAdmin);
    const fromSpy = vi.spyOn(mockedAdmin, "from").mockImplementation((table: string) => {
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: { message: "simulated organizations lookup failure" } }),
            }),
          }),
        } as unknown as ReturnType<typeof realFrom>;
      }
      return realFrom(table);
    });

    try {
      const result = await updateRaffleConfig({ status: "idle" }, form());
      expect(result.status).toBe("error");
    } finally {
      fromSpy.mockRestore();
    }

    // Fails closed: the RPC must never run off a wrongly-assumed "no logo"
    // value, so the rest of the form (nombre) must also be left untouched.
    const { data: row } = await admin.from("raffles").select("nombre").eq("id", raffle.id).single();
    expect(row!.nombre).not.toBe("Rifa actualizada");

    const { data: org2 } = await admin.from("organizations").select("logo_url").eq("id", org.id).single();
    expect(org2!.logo_url).toBe("https://example.com/keep.png");
  });

  it("denies a caller with no membership in the resolved organization", async () => {
    const org = await createTestOrg(admin, "save-no-membership");
    createdOrgIds.push(org.id);
    await createTestRaffle(admin, org.id, "save-no-membership");
    const user = await createAuthedUser("save-no-membership");
    createdUsers.push(user);
    activate(org, user);

    await expect(updateRaffleConfig({ status: "idle" }, form())).rejects.toThrow();
  });
});
