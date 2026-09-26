import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

// Integration test against the LOCAL Supabase stack (like the other DB tests).
// 0014_drop_legacy_rpcs.sql removes the single-tenant RPCs superseded by the
// tenant-scoped *_rifa functions (0010). Dropped functions surface from
// PostgREST as PGRST202 ("could not find the function"); functions that still
// exist but are revoked from anon surface as "permission denied" instead.

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

let admin: SupabaseClient;
let anon: SupabaseClient;

beforeAll(() => {
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, opts);
  anon = createClient(SUPABASE_URL, ANON_KEY, opts);
});

const FAKE_ID = "00000000-0000-0000-0000-000000000000";

const DROPPED: Array<[string, Record<string, unknown>]> = [
  [
    "reservar_numeros",
    {
      p_cantidad: 1,
      p_nombre: "x",
      p_apellido: "x",
      p_correo: "x@example.com",
      p_whatsapp: "3000000000",
      p_direccion: "x",
      p_ciudad: "x",
      p_paquete_tipo: "custom",
    },
  ],
  ["confirmar_pago_admin", { p_reserva_id: FAKE_ID }],
  ["rechazar_reserva_admin", { p_reserva_id: FAKE_ID }],
  ["editar_numero_admin", { p_reserva_id: FAKE_ID, p_numero_anterior: 1, p_numero_nuevo: 2 }],
  ["reasignar_numeros_admin", { p_reserva_id: FAKE_ID }],
];

describe("0014 legacy RPCs are dropped", () => {
  for (const [name, args] of DROPPED) {
    it(`${name} no longer exists (even for service_role)`, async () => {
      const { error } = await admin.rpc(name, args);
      expect(error).not.toBeNull();
      expect(error?.code).toBe("PGRST202");
    });
  }
});

describe("0014 keeps still-referenced functions", () => {
  it("liberar_reservas_expiradas (pg_cron target) still exists", async () => {
    const { error } = await admin.rpc("liberar_reservas_expiradas");
    expect(error?.code).not.toBe("PGRST202");
    expect(error).toBeNull();
  });

  it("marcar_en_verificacion (used by submitReservation) still exists and stays revoked from anon", async () => {
    const { error } = await anon.rpc("marcar_en_verificacion", {
      p_reserva_id: FAKE_ID,
      p_comprobante_url: "https://example.com/fake.png",
    });
    expect(error).not.toBeNull();
    expect(error?.code).not.toBe("PGRST202");
    expect(error?.message.toLowerCase()).toContain("permission denied");
  });
});
