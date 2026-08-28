import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

interface ReservarNumerosRow {
  reserva_id: string;
  numeros_asignados: number[];
}

function randomQty(min = 3, max = 8) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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

describe("reservar_numeros concurrency", () => {
  const CONCURRENT_CALLS = 50;
  let successfulRows: ReservarNumerosRow[] = [];

  beforeAll(async () => {
    const calls = Array.from({ length: CONCURRENT_CALLS }, (_, i) => {
      const contact = dummyContact(`concurrency-${i}`);
      return admin.rpc("reservar_numeros", {
        p_cantidad: randomQty(),
        ...contact,
      });
    });

    const results = await Promise.allSettled(calls);

    successfulRows = results
      .filter(
        (r): r is PromiseFulfilledResult<{ data: ReservarNumerosRow[] | null; error: unknown }> =>
          r.status === "fulfilled" && r.value.error == null && r.value.data != null
      )
      .flatMap((r) => r.value.data as ReservarNumerosRow[]);
  });

  it("assigns every raffle number to at most one reservation under concurrent load", () => {
    const allNumbers = successfulRows.flatMap((row) => row.numeros_asignados);
    const uniqueNumbers = new Set(allNumbers);

    expect(allNumbers.length).toBeGreaterThan(0);
    expect(uniqueNumbers.size).toBe(allNumbers.length);
  });

  it("succeeds for (roughly) all concurrent callers, since 100,000 numbers are available", () => {
    // With 100,000 numbers and each call taking at most 8, all 50 concurrent
    // calls should succeed — none should be starved out.
    expect(successfulRows.length).toBe(CONCURRENT_CALLS);
  });
});

describe("reservar_numeros exhaustion", () => {
  it("rejects a request for more numbers than remain, atomically (no partial reservation)", async () => {
    // reservar_numeros caps p_cantidad at 200 (see 0001_init.sql), so we
    // can't prove "not enough available numbers" just by asking for more
    // than the ~100,000-number pool. Instead, drain the pool down to a
    // handful of available numbers directly (service role bypasses RLS),
    // then request more than that handful while staying under the 200 cap.
    const KEEP_AVAILABLE = 5;

    const { data: toKeep, error: toKeepError } = await admin
      .from("numeros")
      .select("numero")
      .eq("estado", "disponible")
      .order("numero")
      .limit(KEEP_AVAILABLE);

    expect(toKeepError).toBeNull();
    const keepNumbers = (toKeep as { numero: number }[]).map((r) => r.numero);
    expect(keepNumbers.length).toBe(KEEP_AVAILABLE);

    const { error: drainError } = await admin
      .from("numeros")
      .update({ estado: "vendido" })
      .eq("estado", "disponible");

    expect(drainError).toBeNull();

    const { error: restoreError } = await admin
      .from("numeros")
      .update({ estado: "disponible" })
      .in("numero", keepNumbers);

    expect(restoreError).toBeNull();

    const { count, error: countError } = await admin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("estado", "disponible");

    expect(countError).toBeNull();
    expect(count).toBe(KEEP_AVAILABLE);

    const requestTooMany = KEEP_AVAILABLE + 5; // > remaining, still <= 200 cap
    const contact = dummyContact("exhaustion");

    const { data, error } = await admin.rpc("reservar_numeros", {
      p_cantidad: requestTooMany,
      ...contact,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("No hay suficientes números disponibles");
    expect(data).toBeNull();

    // Confirm the SQL function is atomic: no orphaned partial reservation
    // was left behind for this failed call.
    const { data: orphaned, error: orphanedError } = await admin
      .from("reservas")
      .select("id")
      .eq("correo", contact.p_correo);

    expect(orphanedError).toBeNull();
    expect(orphaned).toEqual([]);

    // And none of the still-available numbers were partially consumed.
    const { count: countAfter, error: countAfterError } = await admin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("estado", "disponible");

    expect(countAfterError).toBeNull();
    expect(countAfter).toBe(KEEP_AVAILABLE);

    // Cleanup: restore the numbers we drained to 'vendido' back to
    // 'disponible' so this test stays self-contained and re-runnable
    // against the same local stack without needing `supabase db reset`
    // between invocations. Nothing else in this schema ever sets
    // estado='vendido', so every 'vendido' row at this point is one we
    // created above.
    const { error: cleanupError } = await admin
      .from("numeros")
      .update({ estado: "disponible" })
      .eq("estado", "vendido");

    expect(cleanupError).toBeNull();
  });
});

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
  it("denies anon calls to reservar_numeros (REVOKE EXECUTE regression test)", async () => {
    const contact = dummyContact("anon-reservar");
    const { data, error } = await anon.rpc("reservar_numeros", {
      p_cantidad: 3,
      ...contact,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message.toLowerCase()).toContain("permission denied");
  });

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

describe("random number assignment", () => {
  it("does not always assign the lowest contiguous block of available numbers", async () => {
    const contact = dummyContact("random-assignment");
    const { data, error } = await admin.rpc("reservar_numeros", {
      p_cantidad: 5,
      ...contact,
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const row = (data as ReservarNumerosRow[])[0];

    // Sequential/lowest-first assignment would always produce [0, 1, 2, 3, 4]
    // on a fresh DB. `order by random()` should not do that.
    expect(row.numeros_asignados).not.toEqual([0, 1, 2, 3, 4]);

    // Cleanup: release the numbers this test reserved so the suite stays
    // rerunnable without requiring `supabase db reset` between invocations.
    const { error: cleanupError } = await admin
      .from("numeros")
      .update({ estado: "disponible", reserva_id: null })
      .in("numero", row.numeros_asignados);

    expect(cleanupError).toBeNull();

    const { error: reservaCleanupError } = await admin
      .from("reservas")
      .delete()
      .eq("id", row.reserva_id);

    expect(reservaCleanupError).toBeNull();
  });
});

describe("numero_display generated column", () => {
  it("zero-pads numero to 5 digits", async () => {
    const { data, error } = await admin
      .from("numeros")
      .select("numero, numero_display")
      .eq("numero", 52)
      .single();

    expect(error).toBeNull();
    const row = data as { numero: number; numero_display: string };
    expect(row.numero).toBe(52);
    expect(row.numero_display).toBe("00052");
    expect(row.numero_display).toHaveLength(5);
  });
});

afterAll(async () => {
  // No teardown of the local DB itself — `npx supabase stop` (run by the
  // developer / CI step after `npm test`) tears down the whole stack.
});
