import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The reservation detail shows what the buyer owes. That total must come from
// THIS raffle's price, not a constant that belonged to a different tenant.
// DB-free: the server actions are mocked away and effects don't run under
// renderToStaticMarkup.

vi.mock("@/app/admin/actions", () => ({
  confirmarPago: vi.fn(),
  editarNumero: vi.fn(),
  getComprobanteUrl: vi.fn(),
  reasignarNumeros: vi.fn(),
  rechazarReserva: vi.fn(),
}));

const { default: ReservasTab } = await import("../components/admin/ReservasTab");

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

function detailHtml(pricePerNumber: number | null): string {
  return renderToStaticMarkup(
    createElement(ReservasTab, {
      reservas: [reserva],
      selectedReservaId: reserva.id,
      onSelectReserva: () => {},
      onCloseDetail: () => {},
      onChanged: async () => {},
      blessedNumbers: [],
      pricePerNumber,
    })
  );
}

describe("reservation detail total", () => {
  it("multiplies the quantity by this raffle's own price per number", () => {
    // 3 x 200 was the total computed from the old hardcoded price, so this
    // would read "$600" under the previous behavior.
    expect(detailHtml(1000)).toContain("3 números — $3.000");
  });

  it("follows the raffle's price rather than any fixed value", () => {
    expect(detailHtml(1500)).toContain("3 números — $4.500");
  });

  it("shows the quantity without an amount when the raffle price is unknown", () => {
    const html = detailHtml(null);

    expect(html).toContain("3 números");
    expect(html).not.toContain("3 números — $");
  });
});
