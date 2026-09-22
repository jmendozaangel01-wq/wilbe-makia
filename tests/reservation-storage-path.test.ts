import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanupOrg, createTestOrg, createTestRaffle, seedNumeros, type TestOrg, type TestRaffle } from "./helpers/fixtures";

// Task 4.9 (design D2 storage-path fix, applied to the buyer-facing upload
// path): submitReservation (app/actions.ts) prefixes newly uploaded
// `comprobantes` storage paths with `{organization_id}/...`.
//
// Post-review fix (both blind adversarial judges, CRITICAL): submitReservation
// now calls the tenant-scoped reservar_numeros_rifa RPC (not the legacy,
// untenanted reservar_numeros), and Host resolution -> active-raffle
// resolution is REQUIRED and load-bearing -- an unresolved Host or an org
// with no active raffle now fails the whole reservation up front, before any
// Storage upload happens, instead of the old fail-soft-to-flat-path
// behavior. This file's tests cover: organization_id/raffle_id actually
// getting set on the reservas row, admin-side visibility of that row, and
// the new required-resolution failure paths.
//
// submitReservation has hard dependencies on "server-only", next/headers,
// and lib/supabase/admin's service-role client construction (which reads
// production env var names) -- all mocked below, same pattern as
// tests/comprobante-storage.test.ts.

const mockState = vi.hoisted(() => ({ host: "" as string }));

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(mockState.host ? { host: mockState.host } : {}),
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

const { submitReservation } = await import("../app/actions");

/** Minimal valid JPEG signature (FF D8 FF...) so hasValidImageSignature() passes. */
function jpegFile(name = "comprobante.jpg"): File {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  return new File([bytes], name, { type: "image/jpeg" });
}

function buildFormData(correo: string): FormData {
  const formData = new FormData();
  formData.set("nombre", "Test");
  formData.set("apellido", "Buyer");
  formData.set("correo", correo);
  formData.set("whatsapp", "3000000000");
  formData.set("direccion", "Calle Falsa 123");
  formData.set("ciudad", "Cartagena");
  // paquete_65 is a fixed-quantity package (65) -- avoids the custom-package
  // MIN_CUSTOM_QTY=65 threshold subtlety while still being a realistic,
  // valid submission.
  formData.set("paqueteTipo", "paquete_65");
  formData.set("cantidad", "65");
  formData.set("comprobante", jpegFile());
  return formData;
}

describe("submitReservation tenant wiring", () => {
  const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
  const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

  let admin: SupabaseClient;
  const createdOrgIds: string[] = [];
  const uploadedPaths: string[] = [];

  beforeAll(() => {
    admin = createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterEach(() => {
    mockState.host = "";
  });

  afterAll(async () => {
    if (uploadedPaths.length > 0) {
      await admin.storage.from("comprobantes").remove(uploadedPaths);
    }
    for (const orgId of createdOrgIds) {
      await cleanupOrg(admin, orgId);
    }
  });

  async function newOrgWithActiveRaffle(tag: string, maxNumero = 99): Promise<{ org: TestOrg; raffle: TestRaffle }> {
    const org = await createTestOrg(admin, tag);
    createdOrgIds.push(org.id);
    const raffle = await createTestRaffle(admin, org.id, tag, { maxNumero, estado: "activa" });
    await seedNumeros(admin, raffle);
    return { org, raffle };
  }

  it("prefixes the uploaded comprobante path with the Host-resolved organization_id, and sets organization_id/raffle_id on the reservas row", async () => {
    const { org, raffle } = await newOrgWithActiveRaffle("reserva-storage");
    mockState.host = `${org.subdomain}.rifamakia.com`;

    const correo = `buyer-${Date.now()}-${Math.random()}@example.com`;
    const result = await submitReservation({ status: "idle" }, buildFormData(correo));

    expect(result.status).toBe("success");

    const { data: reserva, error } = await admin
      .from("reservas")
      .select("comprobante_url, organization_id, raffle_id")
      .eq("correo", correo)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(error).toBeNull();
    const row = reserva as { comprobante_url: string | null; organization_id: string | null; raffle_id: string | null } | null;
    expect(row?.comprobante_url).toBeTruthy();
    expect(row?.comprobante_url!.startsWith(`${org.id}/`)).toBe(true);
    // The actual bug both blind adversarial reviewers flagged: these two
    // columns must no longer be NULL through the live public purchase flow.
    expect(row?.organization_id).toBe(org.id);
    expect(row?.raffle_id).toBe(raffle.id);

    if (row?.comprobante_url) uploadedPaths.push(row.comprobante_url);
  });

  it("makes the reservation visible to an admin query scoped by organization_id, and actionable via confirmar_pago_rifa", async () => {
    const { org } = await newOrgWithActiveRaffle("reserva-admin-visibility");
    mockState.host = `${org.subdomain}.rifamakia.com`;

    const correo = `buyer-${Date.now()}-${Math.random()}@example.com`;
    const result = await submitReservation({ status: "idle" }, buildFormData(correo));
    expect(result.status).toBe("success");

    // Mirrors app/admin/page.tsx's real reservas query.
    const { data: reservas, error: reservasError } = await admin
      .from("reservas")
      .select("id, comprobante_url")
      .eq("organization_id", org.id)
      .order("creado_en", { ascending: false });

    expect(reservasError).toBeNull();
    expect(reservas).toHaveLength(1);
    const reservaRow = (reservas as { id: string; comprobante_url: string | null }[])[0];
    if (reservaRow.comprobante_url) uploadedPaths.push(reservaRow.comprobante_url);

    // Before the fix, organization_id was NULL on this row, so
    // confirmar_pago_rifa's `where id = ... and organization_id = ...`
    // predicate never matched and raised "Reserva no encontrada".
    const { error: confirmError } = await admin.rpc("confirmar_pago_rifa", {
      p_organization_id: org.id,
      p_reserva_id: reservaRow.id,
    });

    expect(confirmError).toBeNull();

    const { data: confirmed } = await admin.from("reservas").select("estado").eq("id", reservaRow.id).maybeSingle();
    expect((confirmed as { estado: string } | null)?.estado).toBe("confirmado");
  });

  it("fails with a clear buyer-facing error and uploads nothing when the Host does not resolve to any organization", async () => {
    mockState.host = "unknown-subdomain-does-not-exist.rifamakia.com";

    const correo = `buyer-${Date.now()}-${Math.random()}@example.com`;
    const result = await submitReservation({ status: "idle" }, buildFormData(correo));

    expect(result).toEqual({ status: "error", error: "No pudimos identificar la rifa. Por favor intenta de nuevo." });

    const { data: reserva } = await admin.from("reservas").select("id").eq("correo", correo).maybeSingle();
    expect(reserva).toBeNull();
  });

  it("fails with a clear buyer-facing error and uploads nothing when the organization has no active raffle", async () => {
    const org = await createTestOrg(admin, "reserva-no-active-raffle");
    createdOrgIds.push(org.id);
    // Deliberately no createTestRaffle() call -- org exists, but has no
    // raffle at all, let alone an 'activa' one.
    mockState.host = `${org.subdomain}.rifamakia.com`;

    const correo = `buyer-${Date.now()}-${Math.random()}@example.com`;
    const result = await submitReservation({ status: "idle" }, buildFormData(correo));

    expect(result).toEqual({ status: "error", error: "Esta rifa no está disponible en este momento." });

    const { data: reserva } = await admin.from("reservas").select("id").eq("correo", correo).maybeSingle();
    expect(reserva).toBeNull();

    // No orphaned upload under this org's prefix either -- the resolution
    // gate must run before Storage is ever touched.
    const { data: files, error: listError } = await admin.storage.from("comprobantes").list(org.id);
    expect(listError).toBeNull();
    expect(files ?? []).toHaveLength(0);
  });
});
