import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The real server action pulls in server-only modules; the demo must never
// call it, so replace it with a spy.
const submitReservation = vi.fn();
vi.mock("@/app/actions", () => ({ submitReservation }));

const { default: RifaFlow } = await import("../components/RifaFlow");
const { default: ReservationForm } = await import("../components/rifa/ReservationForm");

const selection = { qty: 65, price: 13000, tipo: "paquete_65" as const };
const noop = () => {};

describe("RifaFlow demo flag", () => {
  it("shows the demo notice and renders without calling the real action", () => {
    const html = renderToStaticMarkup(createElement(RifaFlow, { demo: true }));
    expect(html).toContain("Esto es una demo: no se guarda ninguna reserva");
    expect(submitReservation).not.toHaveBeenCalled();
  });

  it("shows no demo notice on tenant hosts (default)", () => {
    const html = renderToStaticMarkup(createElement(RifaFlow));
    expect(html).not.toContain("Esto es una demo");
    expect(html).not.toContain("Crea tu propia rifa");
  });
});

describe("ReservationForm demo mode", () => {
  const base = { selection, formAction: noop, isPending: false };

  it("warns inside the form that nothing is saved and no payment should be made", () => {
    const html = renderToStaticMarkup(
      createElement(ReservationForm, { ...base, state: { status: "idle" }, demo: true })
    );
    expect(html).toContain("Esto es una demo: no se guarda ninguna reserva");
    expect(html).toContain("No realices ningún pago");
  });

  it("does not warn in real mode", () => {
    const html = renderToStaticMarkup(createElement(ReservationForm, { ...base, state: { status: "idle" } }));
    expect(html).not.toContain("Esto es una demo");
  });

  it("success screen in demo mode shows samples, the notice and the sign-up CTA", () => {
    const html = renderToStaticMarkup(
      createElement(ReservationForm, {
        ...base,
        demo: true,
        state: { status: "success", cantidad: 65, sampleNumbers: ["01234", "45678"] },
      })
    );
    expect(html).toContain("Esto es una demo: no se guarda ninguna reserva");
    expect(html).toContain("01234");
    expect(html).toContain("45678");
    expect(html).toMatch(/<a[^>]*href="\/auth\/registro"[^>]*>Crea tu propia rifa gratis/);
    expect(html).not.toMatch(/Iniciá|Registrate|Creá|Probá|Elegí/);
  });

  it("success screen in real mode has no demo notice or CTA", () => {
    const html = renderToStaticMarkup(
      createElement(ReservationForm, { ...base, state: { status: "success", cantidad: 65 } })
    );
    expect(html).toContain("PAGO EN VERIFICACIÓN");
    expect(html).not.toContain("Esto es una demo");
    expect(html).not.toContain("/auth/registro");
  });
});
