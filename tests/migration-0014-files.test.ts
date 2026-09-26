import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Static guard (no DB needed): 0014 must drop exactly the superseded legacy
// RPCs, must NOT drop the two legacy functions still in use, and its
// rollback must recreate every dropped function.

const root = path.resolve(__dirname, "..");
const up = readFileSync(path.join(root, "supabase/migrations/0014_drop_legacy_rpcs.sql"), "utf8");
const down = readFileSync(path.join(root, "supabase/rollback/0014_drop_legacy_rpcs_down.sql"), "utf8");

const DROPPED = [
  "reservar_numeros(integer, text, text, text, text, text, text, text)",
  "confirmar_pago_admin(uuid)",
  "rechazar_reserva_admin(uuid)",
  "editar_numero_admin(uuid, integer, integer)",
  "reasignar_numeros_admin(uuid)",
];

// Still referenced: liberar_reservas_expiradas by the pg_cron job (0009),
// marcar_en_verificacion by app/actions.ts.
const KEPT = ["liberar_reservas_expiradas", "marcar_en_verificacion"];

describe("0014_drop_legacy_rpcs.sql", () => {
  for (const sig of DROPPED) {
    it(`drops ${sig}`, () => {
      expect(up).toContain(`drop function if exists ${sig};`);
    });
  }

  for (const name of KEPT) {
    it(`does not drop ${name}`, () => {
      expect(up).not.toMatch(new RegExp(`drop function[^;]*\b${name}\b`, "i"));
    });
  }
});

describe("0014_drop_legacy_rpcs_down.sql", () => {
  for (const sig of DROPPED) {
    const name = sig.slice(0, sig.indexOf("("));
    it(`recreates ${name} and re-applies its REVOKE`, () => {
      expect(down).toContain(`create or replace function ${name}(`);
      expect(down).toContain(`revoke execute on function ${sig} from public, anon, authenticated;`);
    });
  }
});
