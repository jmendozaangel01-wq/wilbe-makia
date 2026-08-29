import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// These tests run against a REAL local Postgres started via
// `npx supabase start` (see README.md and tests/reservar-numeros.test.ts).
// They are NOT unit tests and will not pass without the local Docker stack
// running.

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

let admin: SupabaseClient;
let anon: SupabaseClient;

beforeAll(() => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

interface TestReserva {
  id: string;
  numeros: number[];
}

/**
 * Creates a reserva directly (bypassing reservar_numeros) so each test can
 * pin down exactly the estado/comprobante_url combination it needs, mirroring
 * the direct-insert pattern already used in reservar-numeros.test.ts.
 */
async function createTestReserva(
  tag: string,
  cantidad: number,
  estado: "pendiente_pago" | "en_verificacion" | "confirmado",
  comprobanteUrl: string | null
): Promise<TestReserva> {
  const { data: available, error: availableError } = await admin
    .from("numeros")
    .select("numero")
    .eq("estado", "disponible")
    .order("numero")
    .limit(cantidad);

  if (availableError) throw availableError;
  const numeros = (available as { numero: number }[]).map((r) => r.numero);
  if (numeros.length !== cantidad) {
    throw new Error(`Expected ${cantidad} available numbers, got ${numeros.length}`);
  }

  const { data: inserted, error: insertError } = await admin
    .from("reservas")
    .insert({
      nombre: "Test",
      apellido: "Admin",
      correo: `test-admin-${tag}@example.com`,
      whatsapp: "3000000000",
      direccion: "Calle Falsa 123",
      ciudad: "Cartagena",
      paquete_tipo: "custom",
      numeros_asignados: numeros,
      estado,
      comprobante_url: comprobanteUrl,
      expira_en: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  const reservaId = (inserted as { id: string }).id;

  const { error: numerosError } = await admin
    .from("numeros")
    .update({ estado: estado === "confirmado" ? "vendido" : "reservado", reserva_id: reservaId })
    .in("numero", numeros);

  if (numerosError) throw numerosError;

  return { id: reservaId, numeros };
}

async function cleanupReserva(reserva: TestReserva) {
  await admin.from("numeros").update({ estado: "disponible", reserva_id: null }).in("numero", reserva.numeros);
  await admin.from("reservas").delete().eq("id", reserva.id);
}

describe("confirmar_pago_admin", () => {
  it("marks the reservation confirmado and its numbers vendido", async () => {
    const reserva = await createTestReserva("confirmar-happy", 3, "en_verificacion", "some/path.jpg");

    const { error } = await admin.rpc("confirmar_pago_admin", { p_reserva_id: reserva.id });
    expect(error).toBeNull();

    const { data: reservaAfter } = await admin.from("reservas").select("estado").eq("id", reserva.id).single();
    expect((reservaAfter as { estado: string }).estado).toBe("confirmado");

    const { data: numerosAfter } = await admin.from("numeros").select("estado").in("numero", reserva.numeros);
    for (const row of numerosAfter as { estado: string }[]) {
      expect(row.estado).toBe("vendido");
    }

    await cleanupReserva(reserva);
  });

  it("rejects confirming a reservation with no comprobante", async () => {
    const reserva = await createTestReserva("confirmar-no-comprobante", 2, "pendiente_pago", null);

    const { error } = await admin.rpc("confirmar_pago_admin", { p_reserva_id: reserva.id });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("no tiene comprobante");

    await cleanupReserva(reserva);
  });

  it("rejects confirming an already-confirmado reservation", async () => {
    const reserva = await createTestReserva("confirmar-twice", 2, "confirmado", "some/path.jpg");

    const { error } = await admin.rpc("confirmar_pago_admin", { p_reserva_id: reserva.id });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("pendiente o en verificación");

    await cleanupReserva(reserva);
  });
});

describe("rechazar_reserva_admin", () => {
  it("frees the reservation's numbers back to disponible", async () => {
    const reserva = await createTestReserva("rechazar-happy", 3, "pendiente_pago", null);

    const { error } = await admin.rpc("rechazar_reserva_admin", { p_reserva_id: reserva.id });
    expect(error).toBeNull();

    const { data: reservaAfter } = await admin.from("reservas").select("estado").eq("id", reserva.id).single();
    expect((reservaAfter as { estado: string }).estado).toBe("rechazado");

    const { data: numerosAfter } = await admin
      .from("numeros")
      .select("estado, reserva_id")
      .in("numero", reserva.numeros);
    for (const row of numerosAfter as { estado: string; reserva_id: string | null }[]) {
      expect(row.estado).toBe("disponible");
      expect(row.reserva_id).toBeNull();
    }

    await cleanupReserva(reserva);
  });

  it("rejects rejecting an already-confirmado reservation", async () => {
    const reserva = await createTestReserva("rechazar-twice", 2, "confirmado", "some/path.jpg");

    const { error } = await admin.rpc("rechazar_reserva_admin", { p_reserva_id: reserva.id });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("pendiente o en verificación");

    await cleanupReserva(reserva);
  });
});

describe("editar_numero_admin", () => {
  it("swaps one assigned number for a specific available one", async () => {
    const reserva = await createTestReserva("editar-happy", 2, "pendiente_pago", null);
    const numeroAnterior = reserva.numeros[0];

    const { data: freeRow } = await admin
      .from("numeros")
      .select("numero")
      .eq("estado", "disponible")
      .order("numero")
      .limit(1)
      .single();
    const numeroNuevo = (freeRow as { numero: number }).numero;

    const { error } = await admin.rpc("editar_numero_admin", {
      p_reserva_id: reserva.id,
      p_numero_anterior: numeroAnterior,
      p_numero_nuevo: numeroNuevo,
    });
    expect(error).toBeNull();

    const { data: anteriorAfter } = await admin
      .from("numeros")
      .select("estado, reserva_id")
      .eq("numero", numeroAnterior)
      .single();
    expect((anteriorAfter as { estado: string }).estado).toBe("disponible");
    expect((anteriorAfter as { reserva_id: string | null }).reserva_id).toBeNull();

    const { data: nuevoAfter } = await admin
      .from("numeros")
      .select("estado, reserva_id")
      .eq("numero", numeroNuevo)
      .single();
    expect((nuevoAfter as { estado: string }).estado).toBe("reservado");
    expect((nuevoAfter as { reserva_id: string }).reserva_id).toBe(reserva.id);

    const { data: reservaAfter } = await admin
      .from("reservas")
      .select("numeros_asignados")
      .eq("id", reserva.id)
      .single();
    const numerosAsignados = (reservaAfter as { numeros_asignados: number[] }).numeros_asignados;
    expect(numerosAsignados).not.toContain(numeroAnterior);
    expect(numerosAsignados).toContain(numeroNuevo);

    await cleanupReserva({ id: reserva.id, numeros: [numeroNuevo, reserva.numeros[1]] });
  });

  it("rejects when the target number is already taken", async () => {
    const reservaA = await createTestReserva("editar-taken-a", 1, "pendiente_pago", null);
    const reservaB = await createTestReserva("editar-taken-b", 1, "pendiente_pago", null);

    const { error } = await admin.rpc("editar_numero_admin", {
      p_reserva_id: reservaB.id,
      p_numero_anterior: reservaB.numeros[0],
      p_numero_nuevo: reservaA.numeros[0],
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("no está disponible");

    await cleanupReserva(reservaA);
    await cleanupReserva(reservaB);
  });

  it("rejects when numero_anterior doesn't belong to the reservation", async () => {
    const reserva = await createTestReserva("editar-not-owned", 1, "pendiente_pago", null);

    const { data: freeRow } = await admin
      .from("numeros")
      .select("numero")
      .eq("estado", "disponible")
      .order("numero")
      .limit(2);
    const [otherFree, targetFree] = (freeRow as { numero: number }[]).map((r) => r.numero);

    const { error } = await admin.rpc("editar_numero_admin", {
      p_reserva_id: reserva.id,
      p_numero_anterior: otherFree,
      p_numero_nuevo: targetFree,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("no pertenece a esta reserva");

    await cleanupReserva(reserva);
  });
});

describe("reasignar_numeros_admin", () => {
  it("draws a fresh same-size random set and frees the old numbers", async () => {
    const reserva = await createTestReserva("reasignar-happy", 3, "pendiente_pago", null);
    const originalNumeros = [...reserva.numeros];

    const { data, error } = await admin.rpc("reasignar_numeros_admin", { p_reserva_id: reserva.id });
    expect(error).toBeNull();
    const nuevos = data as number[];
    expect(nuevos).toHaveLength(originalNumeros.length);

    const { data: oldAfter } = await admin
      .from("numeros")
      .select("estado, reserva_id")
      .in("numero", originalNumeros);
    for (const row of oldAfter as { estado: string; reserva_id: string | null }[]) {
      expect(row.estado).toBe("disponible");
      expect(row.reserva_id).toBeNull();
    }

    const { data: newAfter } = await admin.from("numeros").select("estado, reserva_id").in("numero", nuevos);
    for (const row of newAfter as { estado: string; reserva_id: string }[]) {
      expect(row.estado).toBe("reservado");
      expect(row.reserva_id).toBe(reserva.id);
    }

    const { data: reservaAfter } = await admin
      .from("reservas")
      .select("numeros_asignados")
      .eq("id", reserva.id)
      .single();
    expect((reservaAfter as { numeros_asignados: number[] }).numeros_asignados.sort()).toEqual([...nuevos].sort());

    await cleanupReserva({ id: reserva.id, numeros: nuevos });
  });
});

describe("anon access control", () => {
  it("denies anon calls to the new admin RPCs (REVOKE EXECUTE regression test)", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const results = await Promise.all([
      anon.rpc("confirmar_pago_admin", { p_reserva_id: fakeId }),
      anon.rpc("rechazar_reserva_admin", { p_reserva_id: fakeId }),
      anon.rpc("editar_numero_admin", { p_reserva_id: fakeId, p_numero_anterior: 1, p_numero_nuevo: 2 }),
      anon.rpc("reasignar_numeros_admin", { p_reserva_id: fakeId }),
    ]);

    for (const { data, error } of results) {
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message.toLowerCase()).toContain("permission denied");
    }
  });
});

afterAll(async () => {
  // No teardown of the local DB itself — `npx supabase stop` (run by the
  // developer / CI step after `npm test`) tears down the whole stack.
});
