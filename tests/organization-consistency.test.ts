import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupOrg, createTestOrg, createTestRaffle, type TestOrg, type TestRaffle } from "./helpers/fixtures";

// Regression test for design D1's denormalization risk: numeros.organization_id
// / reservas.organization_id must always equal the owning raffles.organization_id.
// Covers (a) every existing row already satisfies this, and (b) a trigger/
// CHECK now rejects any new write that would violate it. Requires the
// consistency trigger added in 0010_tenant_rpcs.sql (RED until then).

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient;
let orgA: TestOrg;
let orgB: TestOrg;
let raffleA: TestRaffle;

beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  orgA = await createTestOrg(admin, "consistency-a");
  orgB = await createTestOrg(admin, "consistency-b");
  raffleA = await createTestRaffle(admin, orgA.id, "a", { maxNumero: 4 });
});

afterAll(async () => {
  await cleanupOrg(admin, orgA.id);
  await cleanupOrg(admin, orgB.id);
});

describe("numeros/reservas organization_id always matches the owning raffle's organization_id", () => {
  it("every existing numeros row's organization_id equals its raffle's organization_id", async () => {
    const { data, error } = await admin
      .from("numeros")
      .select("numero, organization_id, raffle_id, raffles!inner(organization_id)")
      .not("raffle_id", "is", null);

    expect(error).toBeNull();
    const rows = data as unknown as { organization_id: string; raffles: { organization_id: string } }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.organization_id).toBe(row.raffles.organization_id);
    }
  });

  it("every existing reservas row's organization_id equals its raffle's organization_id", async () => {
    const { data, error } = await admin
      .from("reservas")
      .select("id, organization_id, raffle_id, raffles!inner(organization_id)")
      .not("raffle_id", "is", null);

    expect(error).toBeNull();
    const rows = data as unknown as { organization_id: string; raffles: { organization_id: string } }[];
    for (const row of rows) {
      expect(row.organization_id).toBe(row.raffles.organization_id);
    }
  });

  it("rejects inserting a numeros row whose organization_id does not match raffle_id's owning organization", async () => {
    const { error } = await admin.from("numeros").insert({
      raffle_id: raffleA.id,
      organization_id: orgB.id, // mismatched on purpose
      numero: 999,
      estado: "disponible",
    });

    expect(error).not.toBeNull();
  });

  it("rejects inserting a reservas row whose organization_id does not match raffle_id's owning organization", async () => {
    const { error } = await admin.from("reservas").insert({
      raffle_id: raffleA.id,
      organization_id: orgB.id, // mismatched on purpose
      nombre: "Test",
      apellido: "User",
      correo: "mismatch@example.com",
      whatsapp: "3000000000",
      direccion: "Calle Falsa 123",
      ciudad: "Cartagena",
      paquete_tipo: "custom",
      numeros_asignados: [0],
      estado: "pendiente_pago",
      expira_en: new Date(Date.now() + 10 * 60_000).toISOString(),
    });

    expect(error).not.toBeNull();
  });

  it("rejects a numeros row whose raffle_id does not reference any existing raffle", async () => {
    const fakeRaffleId = "00000000-0000-0000-0000-000000000000";
    const { error } = await admin.from("numeros").insert({
      raffle_id: fakeRaffleId,
      organization_id: orgA.id,
      numero: 998,
      estado: "disponible",
    });

    expect(error).not.toBeNull();
  });
});
