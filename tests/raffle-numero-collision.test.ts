import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupOrg, createTestOrg, createTestRaffle, type TestOrg, type TestRaffle } from "./helpers/fixtures";

// Proves the CRITICAL fix from design D2: once numeros' PK is (raffle_id,
// numero), a raw `numero` value can collide across two raffles in the SAME
// org. editar_numero_rifa and reasignar_numeros_rifa -- including
// reasignar's distinct final assign statement -- must never read, lock, or
// update the other raffle's colliding row. Requires 0010_tenant_rpcs.sql
// (RED until then).

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient;
let org: TestOrg;
let raffle1: TestRaffle; // closed, colliding numero pool
let raffle2: TestRaffle; // active, same numero range

async function insertNumero(raffleId: string, orgId: string, numero: number): Promise<void> {
  const { error } = await admin.from("numeros").insert({
    raffle_id: raffleId,
    organization_id: orgId,
    numero,
    estado: "disponible",
    es_bendecido: false,
  });
  if (error) throw error;
}

async function createReserva(raffle: TestRaffle, tag: string, numero: number): Promise<string> {
  const { data, error } = await admin
    .from("reservas")
    .insert({
      raffle_id: raffle.id,
      organization_id: raffle.organizationId,
      nombre: "Test",
      apellido: "User",
      correo: `${tag}@example.com`,
      whatsapp: "3000000000",
      direccion: "Calle Falsa 123",
      ciudad: "Cartagena",
      paquete_tipo: "custom",
      numeros_asignados: [numero],
      estado: "pendiente_pago",
      expira_en: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;
  const reservaId = (data as { id: string }).id;

  await admin
    .from("numeros")
    .update({ estado: "reservado", reserva_id: reservaId })
    .eq("raffle_id", raffle.id)
    .eq("numero", numero);

  return reservaId;
}

beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  org = await createTestOrg(admin, "collision-org");
  // raffle1 must be closed before raffle2 can be created (one_open_raffle
  // partial unique index, D5) -- doesn't matter for this test since we seed
  // numeros directly rather than through crear_rifa.
  raffle1 = await createTestRaffle(admin, org.id, "r1", { maxNumero: 9, estado: "cerrada" });
  raffle2 = await createTestRaffle(admin, org.id, "r2", { maxNumero: 9, estado: "activa" });

  for (let n = 0; n <= 9; n++) {
    await insertNumero(raffle1.id, org.id, n);
    await insertNumero(raffle2.id, org.id, n);
  }
});

afterAll(async () => {
  await cleanupOrg(admin, org.id);
});

describe("editar_numero_rifa never touches the colliding numero in the other raffle", () => {
  it("swaps only raffle1's numero=1, leaving raffle2's numero=1 disponible", async () => {
    const reservaId = await createReserva(raffle1, "editar-collision", 0);

    const { error } = await admin.rpc("editar_numero_rifa", {
      p_organization_id: org.id,
      p_raffle_id: raffle1.id,
      p_reserva_id: reservaId,
      p_numero_anterior: 0,
      p_numero_nuevo: 1,
    });
    expect(error).toBeNull();

    const { data: r1n1 } = await admin
      .from("numeros")
      .select("estado, reserva_id")
      .eq("raffle_id", raffle1.id)
      .eq("numero", 1)
      .single();
    expect((r1n1 as { estado: string }).estado).toBe("reservado");
    expect((r1n1 as { reserva_id: string }).reserva_id).toBe(reservaId);

    const { data: r2n1 } = await admin
      .from("numeros")
      .select("estado, reserva_id")
      .eq("raffle_id", raffle2.id)
      .eq("numero", 1)
      .single();
    expect((r2n1 as { estado: string }).estado).toBe("disponible");
    expect((r2n1 as { reserva_id: string | null }).reserva_id).toBeNull();
  });
});

describe("reasignar_numeros_rifa's final assign statement never touches the other raffle's colliding row", () => {
  it("reassigns only within raffle1, leaving every raffle2 numero disponible and unassigned", async () => {
    const reservaId = await createReserva(raffle1, "reasignar-collision", 3);

    const { data, error } = await admin.rpc("reasignar_numeros_rifa", {
      p_organization_id: org.id,
      p_raffle_id: raffle1.id,
      p_reserva_id: reservaId,
    });
    expect(error).toBeNull();
    const nuevos = data as number[];
    expect(nuevos).toHaveLength(1);

    const { data: raffle2Rows } = await admin
      .from("numeros")
      .select("numero, estado, reserva_id")
      .eq("raffle_id", raffle2.id);

    expect((raffle2Rows as unknown[]).length).toBe(10);
    for (const row of raffle2Rows as { numero: number; estado: string; reserva_id: string | null }[]) {
      expect(row.estado).toBe("disponible");
      expect(row.reserva_id).toBeNull();
    }

    const { data: r1row } = await admin
      .from("numeros")
      .select("estado, reserva_id")
      .eq("raffle_id", raffle1.id)
      .eq("numero", nuevos[0])
      .single();
    expect((r1row as { estado: string }).estado).toBe("reservado");
    expect((r1row as { reserva_id: string }).reserva_id).toBe(reservaId);
  });
});
