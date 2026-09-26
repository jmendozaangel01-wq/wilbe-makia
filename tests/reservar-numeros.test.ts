import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Legacy single-tenant reservar_numeros tests were retired with 0014
// (superseded by reservar_numeros_rifa, covered by tenant-isolation and
// raffle-* tests). What remains covers functions kept by 0014.
//
// These tests run against a REAL local Postgres started via
// `npx supabase start` (see README.md). They are NOT unit tests and will
// not pass without the local Docker stack running. A JS-based Postgres
// emulator would not correctly model `FOR UPDATE SKIP LOCKED` row locking
// under real concurrency, so this suite intentionally hits a real engine.

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

function dummyContact(tag: string) {
  return {
    p_nombre: "Test",
    p_apellido: "User",
    p_correo: `test-${tag}@example.com`,
    p_whatsapp: "3000000000",
    p_direccion: "Calle Falsa 123",
    p_ciudad: "Cartagena",
    p_paquete_tipo: "custom",
  };
}

describe("liberar_reservas_expiradas", () => {
  it("expires stale pending reservations and releases their numbers back to disponible", async () => {
    // Grab two currently-available numbers to manipulate directly (service
    // role bypasses RLS, matching how the scheduled sweep and the app's
    // server-only client operate).
    const { data: available, error: availableError } = await admin
      .from("numeros")
      .select("numero")
      .eq("estado", "disponible")
      .order("numero")
      .limit(2);

    expect(availableError).toBeNull();
    expect(available).not.toBeNull();
    expect((available as { numero: number }[]).length).toBe(2);

    const numeros = (available as { numero: number }[]).map((r) => r.numero);
    const contact = dummyContact("expiration");
    const pastExpiry = new Date(Date.now() - 60_000).toISOString();

    const { data: inserted, error: insertError } = await admin
      .from("reservas")
      .insert({
        nombre: contact.p_nombre,
        apellido: contact.p_apellido,
        correo: contact.p_correo,
        whatsapp: contact.p_whatsapp,
        direccion: contact.p_direccion,
        ciudad: contact.p_ciudad,
        paquete_tipo: contact.p_paquete_tipo,
        numeros_asignados: numeros,
        estado: "pendiente_pago",
        expira_en: pastExpiry,
      })
      .select("id")
      .single();

    expect(insertError).toBeNull();
    expect(inserted).not.toBeNull();
    const reservaId = (inserted as { id: string }).id;

    const { error: numerosUpdateError } = await admin
      .from("numeros")
      .update({ estado: "reservado", reserva_id: reservaId })
      .in("numero", numeros);

    expect(numerosUpdateError).toBeNull();

    const { error: sweepError } = await admin.rpc("liberar_reservas_expiradas");
    expect(sweepError).toBeNull();

    const { data: reservaAfter, error: reservaAfterError } = await admin
      .from("reservas")
      .select("estado")
      .eq("id", reservaId)
      .single();

    expect(reservaAfterError).toBeNull();
    expect((reservaAfter as { estado: string }).estado).toBe("expirado");

    const { data: numerosAfter, error: numerosAfterError } = await admin
      .from("numeros")
      .select("estado, reserva_id")
      .in("numero", numeros);

    expect(numerosAfterError).toBeNull();
    for (const row of numerosAfter as { estado: string; reserva_id: string | null }[]) {
      expect(row.estado).toBe("disponible");
      expect(row.reserva_id).toBeNull();
    }
  });
});

describe("anon access control", () => {
  it("denies anon calls to marcar_en_verificacion (REVOKE EXECUTE regression test)", async () => {
    const { data, error } = await anon.rpc("marcar_en_verificacion", {
      p_reserva_id: "00000000-0000-0000-0000-000000000000",
      p_comprobante_url: "https://example.com/fake.png",
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message.toLowerCase()).toContain("permission denied");
  });
});

// The numero_display generated column (added in 0003_random_assignment_and_display.sql)
// was dropped in 0009_tenant_constraints.sql as part of the multi-tenant
// migration: per design decision D1, per-raffle zero-padding width can't be
// computed by a single-table generated column once numero is no longer
// globally unique, so padding moved to formatNumero() in lib/constants.ts.
// The former "numero_display generated column" describe block asserting
// that column's existence was removed here for that reason -- it's an
// intentional schema change, not a regression.

afterAll(async () => {
  // No teardown of the local DB itself — `npx supabase stop` (run by the
  // developer / CI step after `npm test`) tears down the whole stack.
});
