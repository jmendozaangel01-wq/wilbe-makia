import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupOrg, createTestOrg, createTestRaffle, seedNumeros, type TestOrg, type TestRaffle } from "./helpers/fixtures";

// Proves the HARD GATE core guarantee (design D2 / spec admin-authorization
// domain): every admin RPC that takes a reserva id also takes
// p_organization_id, and a foreign (non-owning) p_organization_id always
// matches zero rows -- never touches or leaks another tenant's reservation.
//
// Requires supabase/migrations/0010_tenant_rpcs.sql (RED until then: these
// RPCs don't exist yet).

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient;
let orgA: TestOrg;
let orgB: TestOrg;
let raffleA: TestRaffle;
let raffleB: TestRaffle;

async function createReserva(raffle: TestRaffle, tag: string, estado: string, numero: number): Promise<string> {
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
      estado,
      comprobante_url: estado === "en_verificacion" ? "some/path.jpg" : null,
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
  orgA = await createTestOrg(admin, "tenant-iso-a");
  orgB = await createTestOrg(admin, "tenant-iso-b");
  raffleA = await createTestRaffle(admin, orgA.id, "a", { maxNumero: 9 });
  raffleB = await createTestRaffle(admin, orgB.id, "b", { maxNumero: 9 });
  await seedNumeros(admin, raffleA);
  await seedNumeros(admin, raffleB);
});

afterAll(async () => {
  await cleanupOrg(admin, orgA.id);
  await cleanupOrg(admin, orgB.id);
});

describe("tenant isolation: admin RPCs reject a foreign p_organization_id", () => {
  it("confirmar_pago_rifa rejects when p_organization_id does not own the reserva", async () => {
    const reservaId = await createReserva(raffleA, "confirmar-foreign", "en_verificacion", 1);

    const { error } = await admin.rpc("confirmar_pago_rifa", {
      p_organization_id: orgB.id,
      p_reserva_id: reservaId,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("no encontrada");

    const { data: after } = await admin.from("reservas").select("estado").eq("id", reservaId).single();
    expect((after as { estado: string }).estado).toBe("en_verificacion");
  });

  it("rechazar_reserva_rifa rejects when p_organization_id does not own the reserva", async () => {
    const reservaId = await createReserva(raffleA, "rechazar-foreign", "pendiente_pago", 2);

    const { error } = await admin.rpc("rechazar_reserva_rifa", {
      p_organization_id: orgB.id,
      p_reserva_id: reservaId,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("no encontrada");

    const { data: after } = await admin.from("reservas").select("estado").eq("id", reservaId).single();
    expect((after as { estado: string }).estado).toBe("pendiente_pago");
  });

  it("editar_numero_rifa rejects when p_organization_id does not own the reserva", async () => {
    const reservaId = await createReserva(raffleA, "editar-foreign-org", "pendiente_pago", 3);

    const { error } = await admin.rpc("editar_numero_rifa", {
      p_organization_id: orgB.id,
      p_raffle_id: raffleA.id,
      p_reserva_id: reservaId,
      p_numero_anterior: 3,
      p_numero_nuevo: 4,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("no encontrada");
  });

  it("editar_numero_rifa rejects when p_raffle_id does not own the reserva (right org, wrong raffle)", async () => {
    const reservaId = await createReserva(raffleA, "editar-foreign-raffle", "pendiente_pago", 5);

    const { error } = await admin.rpc("editar_numero_rifa", {
      p_organization_id: orgA.id,
      p_raffle_id: raffleB.id,
      p_reserva_id: reservaId,
      p_numero_anterior: 5,
      p_numero_nuevo: 6,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("no encontrada");
  });

  it("reasignar_numeros_rifa rejects when p_organization_id does not own the reserva", async () => {
    const reservaId = await createReserva(raffleA, "reasignar-foreign", "pendiente_pago", 7);

    const { error } = await admin.rpc("reasignar_numeros_rifa", {
      p_organization_id: orgB.id,
      p_raffle_id: raffleA.id,
      p_reserva_id: reservaId,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("no encontrada");
  });

  it("crear_rifa rejects a nonexistent p_organization_id (foreign key violation)", async () => {
    const fakeOrgId = "00000000-0000-0000-0000-000000000000";

    const { error } = await admin.rpc("crear_rifa", {
      p_organization_id: fakeOrgId,
      p_nombre: "Foreign Org Raffle",
      p_max_numero: 5,
      p_precio_por_numero: 200,
      p_paquetes: [],
      p_numeros_bendecidos: [],
      p_sorteo_fecha: "15 OCT 2026",
      p_nequi_numero: "3000000000",
      p_nequi_nombre: "Test",
    });

    expect(error).not.toBeNull();
    expect(error?.message.toLowerCase()).toMatch(/foreign key|constraint/);
  });
});
