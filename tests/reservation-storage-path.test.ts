import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanupOrg, createTestOrg } from "./helpers/fixtures";

// Task 4.9 (design D2 storage-path fix, applied to the buyer-facing upload
// path): submitReservation (app/actions.ts) prefixes newly uploaded
// `comprobantes` storage paths with `{organization_id}/...` instead of the
// legacy flat `{randomUUID()}.{ext}` naming. This is narrowly scoped to the
// storage path only -- see apply-progress for why submitReservation still
// calls the legacy, untenanted reservar_numeros/marcar_en_verificacion RPCs
// (full tenant-RPC wiring for this action is out of scope for this batch,
// deferred to Phase 5's onboarding wiring per Phase 2's own deviation note).
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

describe("submitReservation storage path tenant prefixing", () => {
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

  it("prefixes the uploaded comprobante path with the Host-resolved organization_id", async () => {
    const org = await createTestOrg(admin, "reserva-storage");
    createdOrgIds.push(org.id);
    mockState.host = `${org.subdomain}.rifamakia.com`;

    const correo = `buyer-${Date.now()}-${Math.random()}@example.com`;
    const result = await submitReservation({ status: "idle" }, buildFormData(correo));

    expect(result.status).toBe("success");

    const { data: reserva, error } = await admin
      .from("reservas")
      .select("comprobante_url")
      .eq("correo", correo)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(error).toBeNull();
    const path = (reserva as { comprobante_url: string | null } | null)?.comprobante_url;
    expect(path).toBeTruthy();
    expect(path!.startsWith(`${org.id}/`)).toBe(true);

    if (path) uploadedPaths.push(path);
  });

  it("falls back to the legacy flat path when the Host does not resolve to any organization", async () => {
    mockState.host = "unknown-subdomain-does-not-exist.rifamakia.com";

    const correo = `buyer-${Date.now()}-${Math.random()}@example.com`;
    const result = await submitReservation({ status: "idle" }, buildFormData(correo));

    expect(result.status).toBe("success");

    const { data: reserva, error } = await admin
      .from("reservas")
      .select("comprobante_url")
      .eq("correo", correo)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(error).toBeNull();
    const path = (reserva as { comprobante_url: string | null } | null)?.comprobante_url;
    expect(path).toBeTruthy();
    // No "/" at all -- flat {randomUUID()}.{ext}, matching the pre-4.9 shape.
    expect(path!.includes("/")).toBe(false);

    if (path) uploadedPaths.push(path);
  });
});
