import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createTestOrg,
  createTestRaffle,
  seedNumeros,
  cleanupOrg,
  type TestOrg,
  type TestRaffle,
} from "./helpers/fixtures";

// Integration tests for actualizar_rifa() (0015_raffle_config_update.sql) --
// the first update path for a raffle's configuration after creation
// (product/tenant-admin-raffle-config in engram). Exercises the real RPC
// end to end (tenant scoping, field validation, and the optional
// organizations.logo_url side-update), not just the TS-level validator
// (see tests/raffle-config-validate.test.ts for that).

describe("actualizar_rifa", () => {
  const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
  const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;
  let admin: SupabaseClient;
  const createdOrgIds: string[] = [];

  beforeAll(() => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    for (const orgId of createdOrgIds) {
      await cleanupOrg(admin, orgId);
    }
  });

  async function setup(tag: string): Promise<{ org: TestOrg; raffle: TestRaffle }> {
    const org = await createTestOrg(admin, tag);
    createdOrgIds.push(org.id);
    const raffle = await createTestRaffle(admin, org.id, tag);
    return { org, raffle };
  }

  function validArgs(org: TestOrg, raffle: TestRaffle, overrides: Record<string, unknown> = {}) {
    return {
      p_organization_id: org.id,
      p_raffle_id: raffle.id,
      p_nombre: "Rifa actualizada",
      p_precio_por_numero: 500,
      p_paquetes: [{ tipo: "paquete_10", qty: 10, price: 5000 }],
      p_numeros_bendecidos: [1, 2, 3],
      p_sorteo_fecha: "20 NOV 2026",
      p_nequi_numero: "3009998888",
      p_nequi_nombre: "Nuevo Titular",
      ...overrides,
    };
  }

  it("updates the editable raffle fields", async () => {
    const { org, raffle } = await setup("config-update");

    const { error } = await admin.rpc("actualizar_rifa", validArgs(org, raffle));
    expect(error).toBeNull();

    const { data: row } = await admin
      .from("raffles")
      .select("nombre, precio_por_numero, sorteo_fecha, nequi_numero, nequi_nombre, numeros_bendecidos, max_numero")
      .eq("id", raffle.id)
      .single();

    expect(row).toMatchObject({
      nombre: "Rifa actualizada",
      precio_por_numero: 500,
      sorteo_fecha: "20 NOV 2026",
      nequi_numero: "3009998888",
      nequi_nombre: "Nuevo Titular",
    });
    expect(row!.numeros_bendecidos).toEqual([1, 2, 3]);
  });

  async function blessedFlagged(raffleId: string): Promise<number[]> {
    const { data, error } = await admin
      .from("numeros")
      .select("numero")
      .eq("raffle_id", raffleId)
      .eq("es_bendecido", true)
      .order("numero");
    if (error) throw error;
    return (data ?? []).map((r) => r.numero as number);
  }

  it("resyncs numeros.es_bendecido to the new blessed list (adds new, clears removed)", async () => {
    const { org, raffle } = await setup("config-blessed-resync");
    await seedNumeros(admin, raffle);

    const first = await admin.rpc("actualizar_rifa", validArgs(org, raffle, { p_numeros_bendecidos: [1, 2, 3] }));
    expect(first.error).toBeNull();
    expect(await blessedFlagged(raffle.id)).toEqual([1, 2, 3]);

    const second = await admin.rpc("actualizar_rifa", validArgs(org, raffle, { p_numeros_bendecidos: [3, 7] }));
    expect(second.error).toBeNull();
    expect(await blessedFlagged(raffle.id)).toEqual([3, 7]);

    const cleared = await admin.rpc("actualizar_rifa", validArgs(org, raffle, { p_numeros_bendecidos: [] }));
    expect(cleared.error).toBeNull();
    expect(await blessedFlagged(raffle.id)).toEqual([]);
  });

  it("leaves another raffle's numeros flags untouched when resyncing", async () => {
    const { org, raffle } = await setup("config-blessed-resync-own");
    const other = await setup("config-blessed-resync-other");
    await seedNumeros(admin, raffle);
    await seedNumeros(admin, other.raffle);
    await admin
      .from("numeros")
      .update({ es_bendecido: true })
      .eq("raffle_id", other.raffle.id)
      .in("numero", [10, 11]);

    const { error } = await admin.rpc("actualizar_rifa", validArgs(org, raffle, { p_numeros_bendecidos: [1, 2] }));
    expect(error).toBeNull();

    expect(await blessedFlagged(raffle.id)).toEqual([1, 2]);
    expect(await blessedFlagged(other.raffle.id)).toEqual([10, 11]);
  });

  it("never changes max_numero -- it isn't even a parameter", async () => {
    const { org, raffle } = await setup("config-max-numero-frozen");

    await admin.rpc("actualizar_rifa", validArgs(org, raffle));

    const { data: row } = await admin.from("raffles").select("max_numero").eq("id", raffle.id).single();
    expect(row!.max_numero).toBe(raffle.maxNumero);
  });

  it("rejects a call scoped to the wrong organization (tenant isolation)", async () => {
    const { raffle } = await setup("config-wrong-org");
    const otherOrg = await createTestOrg(admin, "config-wrong-org-other");
    createdOrgIds.push(otherOrg.id);

    const { error } = await admin.rpc("actualizar_rifa", validArgs(otherOrg, raffle));
    expect(error).not.toBeNull();
    expect(error?.message).toContain("no encontrada");
  });

  it("rejects a blessed number above the raffle's max_numero", async () => {
    const { org, raffle } = await setup("config-blessed-oob");

    const { error } = await admin.rpc(
      "actualizar_rifa",
      validArgs(org, raffle, { p_numeros_bendecidos: [raffle.maxNumero + 1] })
    );
    expect(error).not.toBeNull();
  });

  it("rejects an invalid nequi number", async () => {
    const { org, raffle } = await setup("config-bad-nequi");

    const { error } = await admin.rpc("actualizar_rifa", validArgs(org, raffle, { p_nequi_numero: "123" }));
    expect(error).not.toBeNull();
  });

  it("leaves organizations.logo_url untouched when p_logo_url is omitted", async () => {
    const { org, raffle } = await setup("config-logo-untouched");
    await admin.from("organizations").update({ logo_url: "https://example.com/existing.png" }).eq("id", org.id);

    const { error } = await admin.rpc("actualizar_rifa", validArgs(org, raffle));
    expect(error).toBeNull();

    const { data: row } = await admin.from("organizations").select("logo_url").eq("id", org.id).single();
    expect(row!.logo_url).toBe("https://example.com/existing.png");
  });

  it("updates organizations.logo_url when p_logo_url is provided", async () => {
    const { org, raffle } = await setup("config-logo-update");

    const { error } = await admin.rpc(
      "actualizar_rifa",
      validArgs(org, raffle, { p_logo_url: "https://example.supabase.co/storage/v1/object/public/logos/foo.png" })
    );
    expect(error).toBeNull();

    const { data: row } = await admin.from("organizations").select("logo_url").eq("id", org.id).single();
    expect(row!.logo_url).toBe("https://example.supabase.co/storage/v1/object/public/logos/foo.png");
  });

  it("rejects a non-http(s) p_logo_url", async () => {
    const { org, raffle } = await setup("config-logo-bad-scheme");

    const { error } = await admin.rpc("actualizar_rifa", validArgs(org, raffle, { p_logo_url: "javascript:alert(1)" }));
    expect(error).not.toBeNull();
  });

  it("leaves raffles.qr_url untouched when p_qr_url is omitted", async () => {
    const { org, raffle } = await setup("config-qr-untouched");
    await admin.from("raffles").update({ qr_url: "https://example.com/existing-qr.png" }).eq("id", raffle.id);

    const { error } = await admin.rpc("actualizar_rifa", validArgs(org, raffle));
    expect(error).toBeNull();

    const { data: row } = await admin.from("raffles").select("qr_url").eq("id", raffle.id).single();
    expect(row!.qr_url).toBe("https://example.com/existing-qr.png");
  });

  it("updates raffles.qr_url when p_qr_url is provided", async () => {
    const { org, raffle } = await setup("config-qr-update");

    const { error } = await admin.rpc(
      "actualizar_rifa",
      validArgs(org, raffle, { p_qr_url: "https://example.supabase.co/storage/v1/object/public/logos/foo-qr.png" })
    );
    expect(error).toBeNull();

    const { data: row } = await admin.from("raffles").select("qr_url").eq("id", raffle.id).single();
    expect(row!.qr_url).toBe("https://example.supabase.co/storage/v1/object/public/logos/foo-qr.png");
  });

  it("rejects a non-http(s) p_qr_url", async () => {
    const { org, raffle } = await setup("config-qr-bad-scheme");

    const { error } = await admin.rpc("actualizar_rifa", validArgs(org, raffle, { p_qr_url: "javascript:alert(1)" }));
    expect(error).not.toBeNull();
  });

  it("rejects a call scoped to the wrong organization even when only p_qr_url is set", async () => {
    const { raffle } = await setup("config-qr-wrong-org");
    const otherOrg = await createTestOrg(admin, "config-qr-wrong-org-other");
    createdOrgIds.push(otherOrg.id);

    const { error } = await admin.rpc(
      "actualizar_rifa",
      validArgs(otherOrg, raffle, { p_qr_url: "https://example.com/qr.png" })
    );
    expect(error).not.toBeNull();
    expect(error?.message).toContain("no encontrada");
  });

  it("leaves premio_nombre and premio_imagen_url untouched when both params are omitted", async () => {
    const { org, raffle } = await setup("config-premio-untouched");
    await admin.from("raffles").update({ premio_imagen_url: "https://example.com/existing-premio.png" }).eq("id", raffle.id);

    const { error } = await admin.rpc("actualizar_rifa", validArgs(org, raffle));
    expect(error).toBeNull();

    const { data: row } = await admin.from("raffles").select("premio_nombre, premio_imagen_url").eq("id", raffle.id).single();
    expect(row).toEqual({
      premio_nombre: "Test Prize config-premio-untouched",
      premio_imagen_url: "https://example.com/existing-premio.png",
    });
  });

  it("updates premio_nombre (trimmed) and premio_imagen_url when provided", async () => {
    const { org, raffle } = await setup("config-premio-update");

    const { error } = await admin.rpc(
      "actualizar_rifa",
      validArgs(org, raffle, {
        p_premio_nombre: "  Gánate una moto XTZ 660 0-KM  ",
        p_premio_imagen_url: "https://example.supabase.co/storage/v1/object/public/logos/premio.png",
      })
    );
    expect(error).toBeNull();

    const { data: row } = await admin.from("raffles").select("premio_nombre, premio_imagen_url").eq("id", raffle.id).single();
    expect(row).toEqual({
      premio_nombre: "Gánate una moto XTZ 660 0-KM",
      premio_imagen_url: "https://example.supabase.co/storage/v1/object/public/logos/premio.png",
    });
  });

  it.each([
    ["blank prize title", { p_premio_nombre: "   " }],
    ["prize title over 120 chars", { p_premio_nombre: "x".repeat(121) }],
    ["non-http(s) prize image", { p_premio_imagen_url: "javascript:alert(1)" }],
    ["prize image over 2048 chars", { p_premio_imagen_url: `https://example.com/${"a".repeat(2040)}` }],
  ])("rejects %s", async (_label, overrides) => {
    const { org, raffle } = await setup("config-premio-bad");

    const { error } = await admin.rpc("actualizar_rifa", validArgs(org, raffle, overrides));
    expect(error).not.toBeNull();

    const { data: row } = await admin.from("raffles").select("premio_nombre, premio_imagen_url").eq("id", raffle.id).single();
    expect(row).toEqual({ premio_nombre: "Test Prize config-premio-bad", premio_imagen_url: null });
  });

  it("rejects a call scoped to the wrong organization even when only the prize params are set", async () => {
    const { raffle } = await setup("config-premio-wrong-org");
    const otherOrg = await createTestOrg(admin, "config-premio-wrong-org-other");
    createdOrgIds.push(otherOrg.id);

    const { error } = await admin.rpc(
      "actualizar_rifa",
      validArgs(otherOrg, raffle, { p_premio_nombre: "Hijack", p_premio_imagen_url: "https://example.com/x.png" })
    );
    expect(error).not.toBeNull();
    expect(error?.message).toContain("no encontrada");
  });
});

describe("crear_rifa prize columns", () => {
  const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
  const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;
  let admin: SupabaseClient;
  const createdOrgIds: string[] = [];

  beforeAll(() => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    for (const orgId of createdOrgIds) await cleanupOrg(admin, orgId);
  });

  function crearRifaArgs(org: TestOrg, overrides: Record<string, unknown> = {}) {
    return {
      p_organization_id: org.id,
      p_nombre: "Rifa base",
      p_max_numero: 9,
      p_precio_por_numero: 200,
      p_paquetes: [],
      p_numeros_bendecidos: [],
      p_sorteo_fecha: "15 OCT 2026",
      p_nequi_numero: "3000000000",
      p_nequi_nombre: "Test",
      ...overrides,
    };
  }

  it("stores the given prize title and image", async () => {
    const org = await createTestOrg(admin, "crear-rifa-premio");
    createdOrgIds.push(org.id);

    const { data, error } = await admin.rpc(
      "crear_rifa",
      crearRifaArgs(org, { p_premio_nombre: "Gánate una moto", p_premio_imagen_url: "https://example.com/p.png" })
    );
    expect(error).toBeNull();

    const { data: row } = await admin.from("raffles").select("premio_nombre, premio_imagen_url").eq("id", data).single();
    expect(row).toEqual({ premio_nombre: "Gánate una moto", premio_imagen_url: "https://example.com/p.png" });
  });

  it("falls back to the raffle name when no prize title is passed (old callers, no overload ambiguity)", async () => {
    const org = await createTestOrg(admin, "crear-rifa-fallback");
    createdOrgIds.push(org.id);

    const { data, error } = await admin.rpc("crear_rifa", crearRifaArgs(org));
    expect(error).toBeNull();

    const { data: row } = await admin.from("raffles").select("premio_nombre, premio_imagen_url").eq("id", data).single();
    expect(row).toEqual({ premio_nombre: "Rifa base", premio_imagen_url: null });
  });
});

describe("logos storage bucket", () => {
  const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
  const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;
  let admin: SupabaseClient;
  const uploadedPaths: string[] = [];

  beforeAll(() => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (uploadedPaths.length > 0) {
      await admin.storage.from("logos").remove(uploadedPaths);
    }
  });

  it("is public (unlike comprobantes) so a logo renders without a signed URL", async () => {
    const { data, error } = await admin.storage.listBuckets();
    expect(error).toBeNull();
    const logos = data?.find((b) => b.id === "logos");
    expect(logos?.public).toBe(true);
  });

  it("returns a stable public URL for an uploaded object", async () => {
    const path = `test-org/${Date.now()}.png`;
    const { error: uploadError } = await admin.storage
      .from("logos")
      .upload(path, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { contentType: "image/png", upsert: true });
    expect(uploadError).toBeNull();
    uploadedPaths.push(path);

    const { data } = admin.storage.from("logos").getPublicUrl(path);
    expect(data.publicUrl).toContain("/storage/v1/object/public/logos/");
    expect(data.publicUrl).toContain(path);
  });
});
