import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The admin panel must highlight the tenant's OWN blessed numbers
// (raffles.numeros_bendecidos), never the fixed list that used to live in
// lib/constants.ts and belonged to a different tenant. DB-free: the server
// actions are mocked away and effects don't run under renderToStaticMarkup.

vi.mock("@/app/admin/actions", () => ({
  confirmarPago: vi.fn(),
  editarNumero: vi.fn(),
  getComprobanteUrl: vi.fn(),
  reasignarNumeros: vi.fn(),
  rechazarReserva: vi.fn(),
}));

const { default: ReservasTab } = await import("../components/admin/ReservasTab");

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const reserva = {
  id: "r1",
  nombre: "Ana",
  apellido: "Perez",
  correo: "ana@example.com",
  whatsapp: "3001112222",
  direccion: "Calle 1",
  ciudad: "Cartagena",
  paquete_tipo: "paquete_10",
  numeros_asignados: [7734, 42, 100],
  comprobante_url: null,
  estado: "confirmado" as const,
  creado_en: "2026-01-01T00:00:00Z",
  expira_en: "2026-01-02T00:00:00Z",
};

function highlightedNumbers(blessedNumbers: number[]): string[] {
  const html = renderToStaticMarkup(
    createElement(ReservasTab, {
      reservas: [reserva],
      selectedReservaId: reserva.id,
      onSelectReserva: () => {},
      onCloseDetail: () => {},
      onChanged: async () => {},
      blessedNumbers,
    })
  );
  return [...html.matchAll(/Número bendecido">★<\/span><span>(\d{5})<\/span>/g)].map((m) => m[1]);
}

describe("admin blessed numbers source", () => {
  it("no longer references the hardcoded BLESSED_NUMBERS in the admin tabs", () => {
    expect(read("components/admin/NumerosTab.tsx")).not.toContain("BLESSED_NUMBERS");
    expect(read("components/admin/ReservasTab.tsx")).not.toContain("BLESSED_NUMBERS");
  });

  it("scopes the NumerosTab blessed query to the tenant's own list and raffle", () => {
    const source = read("components/admin/NumerosTab.tsx");
    expect(source).toContain('.in("numero", blessedNumbers)');
    expect(source).toContain('.eq("raffle_id", raffleId)');
  });

  it("highlights only the numbers in the tenant's own list", () => {
    expect(highlightedNumbers([42])).toEqual(["00042"]);
  });

  it("does not highlight a number the tenant never configured, even if it was blessed for another tenant", () => {
    expect(highlightedNumbers([42])).not.toContain("07734");
    expect(highlightedNumbers([])).toEqual([]);
  });
});
