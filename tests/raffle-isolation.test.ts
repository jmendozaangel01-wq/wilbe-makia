import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupOrg, createTestOrg, createTestRaffle, seedNumeros, type TestOrg, type TestRaffle } from "./helpers/fixtures";

// Proves reservar_numeros_rifa's raffle_id-scoped pool holds under concurrent
// load across two raffles (mirrors tests/reservar-numeros.test.ts's
// concurrency guarantee, now re-checked after the predicate + PK change --
// see design D1/Testing Strategy). Requires 0010_tenant_rpcs.sql (RED until
// then).

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient;
let orgA: TestOrg;
let orgB: TestOrg;
let raffleA: TestRaffle;
let raffleB: TestRaffle;

function dummyContact(tag: string) {
  return {
    p_nombre: "Test",
    p_apellido: "User",
    p_correo: `${tag}@example.com`,
    p_whatsapp: "3000000000",
    p_direccion: "Calle Falsa 123",
    p_ciudad: "Cartagena",
    p_paquete_tipo: "custom",
  };
}

interface ReservarRow {
  reserva_id: string;
  numeros_asignados: number[];
}

beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  orgA = await createTestOrg(admin, "raffle-iso-a");
  orgB = await createTestOrg(admin, "raffle-iso-b");
  raffleA = await createTestRaffle(admin, orgA.id, "a", { maxNumero: 39 }); // 40 numbers
  raffleB = await createTestRaffle(admin, orgB.id, "b", { maxNumero: 39 }); // 40 numbers
  await seedNumeros(admin, raffleA);
  await seedNumeros(admin, raffleB);
});

afterAll(async () => {
  await cleanupOrg(admin, orgA.id);
  await cleanupOrg(admin, orgB.id);
});

describe("reservar_numeros_rifa concurrency across two raffles", () => {
  it("never cross-assigns a number between raffle A and raffle B under concurrent load", async () => {
    const callsA = Array.from({ length: 10 }, (_, i) =>
      admin.rpc("reservar_numeros_rifa", { p_raffle_id: raffleA.id, p_cantidad: 2, ...dummyContact(`ra-${i}`) })
    );
    const callsB = Array.from({ length: 10 }, (_, i) =>
      admin.rpc("reservar_numeros_rifa", { p_raffle_id: raffleB.id, p_cantidad: 2, ...dummyContact(`rb-${i}`) })
    );

    const results = await Promise.allSettled([...callsA, ...callsB]);
    const fulfilled = results.filter(
      (r) => r.status === "fulfilled" && r.value.error == null && r.value.data != null
    ) as PromiseFulfilledResult<{ data: ReservarRow[] | null; error: unknown }>[];

    expect(fulfilled.length).toBe(20);

    const { data: reservas } = await admin
      .from("reservas")
      .select("raffle_id, organization_id")
      .in("raffle_id", [raffleA.id, raffleB.id]);

    for (const row of reservas as { raffle_id: string; organization_id: string }[]) {
      const expectedOrg = row.raffle_id === raffleA.id ? orgA.id : orgB.id;
      expect(row.organization_id).toBe(expectedOrg);
    }

    const { data: numerosA } = await admin
      .from("numeros")
      .select("numero")
      .eq("raffle_id", raffleA.id)
      .eq("estado", "reservado");
    const { data: numerosB } = await admin
      .from("numeros")
      .select("numero")
      .eq("raffle_id", raffleB.id)
      .eq("estado", "reservado");

    // 10 calls * 2 numbers each, per raffle -- proves the two pools never bled into each other.
    expect((numerosA as unknown[]).length).toBe(20);
    expect((numerosB as unknown[]).length).toBe(20);
  });
});

describe("reservar_numeros_rifa exhaustion is per-raffle", () => {
  it("exhausting raffle A's pool does not affect raffle B's availability", async () => {
    // raffle A has 40 - 20 already reserved above = 20 left; drain them.
    const { error: drainError } = await admin.rpc("reservar_numeros_rifa", {
      p_raffle_id: raffleA.id,
      p_cantidad: 20,
      ...dummyContact("drain-a"),
    });
    expect(drainError).toBeNull();

    const { error: exhaustError } = await admin.rpc("reservar_numeros_rifa", {
      p_raffle_id: raffleA.id,
      p_cantidad: 1,
      ...dummyContact("exhausted-a"),
    });
    expect(exhaustError).not.toBeNull();
    expect(exhaustError?.message).toContain("No hay suficientes números disponibles");

    // raffle B still has its 20 remaining -- untouched by raffle A's exhaustion.
    const { count } = await admin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("raffle_id", raffleB.id)
      .eq("estado", "disponible");
    expect(count).toBe(20);
  });
});
