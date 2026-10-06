import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// AdminDashboard must offer a way to end the session -- otherwise an admin
// who lands on /admin/login while already signed in (middleware bounces them
// straight back to /admin) has no way to switch accounts or force a re-login.
// Renders to static markup (no DOM/click simulation, matching the rest of
// this suite's component tests) so this only covers the button's presence,
// not the signOut() + redirect behavior wired to its onClick.

// AdminDashboard renders ConfiguracionTab and ReservasTab, which import
// server action modules ("server-only") -- mock them away, same as
// configuracion-tab-raffle-link.test.ts.
vi.mock("@/app/admin/config-actions", () => ({ updateRaffleConfig: vi.fn() }));
vi.mock("@/app/admin/actions", () => ({
  confirmarPago: vi.fn(),
  editarNumero: vi.fn(),
  getComprobanteUrl: vi.fn(),
  reasignarNumeros: vi.fn(),
  rechazarReserva: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: null } }), signOut: vi.fn() },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), unsubscribe: vi.fn() }),
    removeChannel: vi.fn(),
  }),
}));

const { default: AdminDashboard } = await import("../components/admin/AdminDashboard");

function render() {
  return renderToStaticMarkup(
    createElement(AdminDashboard, {
      initialReservas: [],
      initialCounts: { disponibles: 0, reservados: 0, vendidos: 0 },
      orgName: "Rifa Demo",
      organizationId: "org-1",
      raffleConfig: null,
      logoUrl: null,
      qrUrl: null,
      premioImagenUrl: null,
      raffleUrl: null,
      blessedNumbers: [],
      raffleId: null,
    })
  );
}

describe("AdminDashboard logout", () => {
  it("renders a 'Cerrar sesión' button in the header", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*>Cerrar sesión<\/button>/);
  });
});
