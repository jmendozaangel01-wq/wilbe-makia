import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupOrg, createTestOrg, createTestRaffle, seedNumeros, type TestOrg, type TestRaffle } from "./helpers/fixtures";
import { createAuthedUser, deleteTestUser, type AuthedTestUser } from "./helpers/auth";

// Proves 0011_rls_rewrite.sql's membership-based RLS: org A's authenticated
// session reads 0 rows of org B's reservas/numeros/raffles, and only its own
// organization_members row -- replacing 0004's blanket
// authenticated_read_reservas/numeros policies (any authenticated session =
// any tenant's data). RED until 0011_rls_rewrite.sql exists.

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient;
let orgA: TestOrg;
let orgB: TestOrg;
let raffleA: TestRaffle;
let raffleB: TestRaffle;
let userA: AuthedTestUser;
let userB: AuthedTestUser;

async function createReserva(raffle: TestRaffle, tag: string, numero: number): Promise<void> {
  const { error } = await admin.from("reservas").insert({
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
  });
  if (error) throw error;
}

beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  orgA = await createTestOrg(admin, "rls-a");
  orgB = await createTestOrg(admin, "rls-b");
  raffleA = await createTestRaffle(admin, orgA.id, "a", { maxNumero: 4 });
  raffleB = await createTestRaffle(admin, orgB.id, "b", { maxNumero: 4 });
  await seedNumeros(admin, raffleA);
  await seedNumeros(admin, raffleB);
  await createReserva(raffleA, "rls-reserva-a", 0);
  await createReserva(raffleB, "rls-reserva-b", 0);

  userA = await createAuthedUser("rls-user-a");
  userB = await createAuthedUser("rls-user-b");
  await admin.from("organization_members").insert({ organization_id: orgA.id, user_id: userA.userId, role: "owner" });
  await admin.from("organization_members").insert({ organization_id: orgB.id, user_id: userB.userId, role: "owner" });
});

afterAll(async () => {
  await cleanupOrg(admin, orgA.id);
  await cleanupOrg(admin, orgB.id);
  await deleteTestUser(userA.userId);
  await deleteTestUser(userB.userId);
});

describe("membership-based RLS on reservas/numeros", () => {
  it("org A's authenticated session reads 0 rows of org B's reservas", async () => {
    const { data, error } = await userA.client.from("reservas").select("id, organization_id").eq("organization_id", orgB.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("org A's authenticated session reads its own reservas normally", async () => {
    const { data, error } = await userA.client.from("reservas").select("id, organization_id").eq("organization_id", orgA.id);
    expect(error).toBeNull();
    expect((data as unknown[]).length).toBeGreaterThan(0);
  });

  it("org A's authenticated session reads 0 rows of org B's numeros", async () => {
    const { data, error } = await userA.client.from("numeros").select("numero, organization_id").eq("organization_id", orgB.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("membership-based RLS on organization_members", () => {
  it("a member reads only their own membership row, never another organization's members", async () => {
    const { data, error } = await userA.client.from("organization_members").select("organization_id, user_id");
    expect(error).toBeNull();
    const rows = data as { organization_id: string; user_id: string }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.organization_id).toBe(orgA.id);
    }
  });
});

describe("membership-based RLS on raffles", () => {
  it("org A's authenticated session cannot read org B's raffle row", async () => {
    const { data, error } = await userA.client.from("raffles").select("id").eq("id", raffleB.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("org A's authenticated session reads its own raffle row normally", async () => {
    const { data, error } = await userA.client.from("raffles").select("id").eq("id", raffleA.id);
    expect(error).toBeNull();
    expect((data as unknown[]).length).toBe(1);
  });
});
