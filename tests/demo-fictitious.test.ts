import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The apex demo must be 100% fictitious: static in-repo data, no Supabase
// reads, no real payment details, no real people or brands.

const mocks = vi.hoisted(() => ({
  host: "benditarifa.com",
  resolveOrganizationByHost: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: mocks.host }),
}));
vi.mock("@/lib/tenant/resolve", () => ({
  resolveOrganizationByHost: mocks.resolveOrganizationByHost,
  DEFAULT_ORG_NAME: "Rifamakia",
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/supabase/client", () => ({ createClient: mocks.createClient }));
vi.mock("@/app/actions", () => ({ submitReservation: vi.fn() }));

const { DEMO_RAFFLE } = await import("../lib/demo/demo-data");
const { default: Home } = await import("../app/page");
const { default: ReservationForm } = await import("../components/rifa/ReservationForm");

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const REAL_STRINGS = ["3015649719", "Jairo Mendoza", "XTZ", "Wilber", "nequi-qr", "moto-hero"];

beforeEach(() => vi.clearAllMocks());

describe("DEMO_RAFFLE dataset", () => {
  it("is fictional: neutral organizer, generic prize, obviously fake payment", () => {
    expect(DEMO_RAFFLE.organizerName).toBe("Rifas Demo");
    expect(DEMO_RAFFLE.prizeName).toMatch(/ejemplo/i);
    expect(DEMO_RAFFLE.payment.number).toBe("300 000 0000");
    expect(DEMO_RAFFLE.payment.holder).toMatch(/ejemplo/i);
    expect(DEMO_RAFFLE.payment.qrLabel).toBe("QR de ejemplo");
    expect(JSON.stringify(DEMO_RAFFLE)).not.toMatch(new RegExp(REAL_STRINGS.join("|")));
  });

  it("has consistent packages, progress and blessed numbers", () => {
    expect(DEMO_RAFFLE.packages.length).toBeGreaterThanOrEqual(3);
    for (const p of DEMO_RAFFLE.packages) {
      expect(p.price).toBe(p.qty * DEMO_RAFFLE.pricePerNumber);
    }
    expect(DEMO_RAFFLE.soldPercent).toBeGreaterThan(0);
    expect(DEMO_RAFFLE.soldPercent).toBeLessThan(100);
    expect(DEMO_RAFFLE.blessedNumbers.length).toBeGreaterThan(0);
    for (const n of DEMO_RAFFLE.blessedNumbers) expect(n).toMatch(/^\d{5}$/);
    for (const n of DEMO_RAFFLE.soldBlessedNumbers) expect(DEMO_RAFFLE.blessedNumbers).toContain(n);
  });
});

describe("demo path sources", () => {
  const files = [
    "lib/demo/demo-data.ts",
    "components/landing/DemoHero.tsx",
    "components/landing/DemoBlessedNumbers.tsx",
  ];

  it.each(files)("%s never imports Supabase or runtime values from lib/constants", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/froms+["'][^"']*supabase/i);
    expect(src).not.toMatch(/^import(?! type).*lib\/constants/m);
    for (const s of REAL_STRINGS) expect(src).not.toContain(s);
  });
});

describe("marketing home render", () => {
  it("does no tenant lookup and no Supabase access on the apex host", async () => {
    mocks.host = "benditarifa.com";
    const html = renderToStaticMarkup(await Home());

    expect(mocks.resolveOrganizationByHost).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();

    expect(html).toContain("Rifas Demo");
    expect(html.toLowerCase()).toContain("moto 0 km (ejemplo)");
    for (const s of REAL_STRINGS) expect(html).not.toContain(s);
  });

  it("still does the tenant lookup on a tenant host", async () => {
    mocks.host = "acme.benditarifa.com";
    mocks.resolveOrganizationByHost.mockResolvedValue(null);
    await Home();
    expect(mocks.resolveOrganizationByHost).toHaveBeenCalledWith("acme.benditarifa.com");
  });
});

describe("ReservationForm payment box", () => {
  const base = { selection: { qty: 65, price: 13000, tipo: "paquete_65" as const }, formAction: () => {}, isPending: false };

  it("demo mode shows fictional payment details and a placeholder instead of the real QR", () => {
    const html = renderToStaticMarkup(createElement(ReservationForm, { ...base, state: { status: "idle" }, demo: true }));
    expect(html).toContain("300 000 0000");
    expect(html).toContain("QR de ejemplo");
    for (const s of REAL_STRINGS) expect(html).not.toContain(s);
  });

  it("real mode keeps the real payment box", () => {
    const html = renderToStaticMarkup(createElement(ReservationForm, { ...base, state: { status: "idle" } }));
    expect(html).toContain("3015649719");
    expect(html).toContain("Jairo Mendoza");
  });

  it("demo success copy does not claim a receipt or an email", () => {
    const html = renderToStaticMarkup(
      createElement(ReservationForm, { ...base, demo: true, state: { status: "success", cantidad: 65, sampleNumbers: ["01234"] } })
    );
    expect(html).toContain("Así verían tus compradores su reserva confirmada");
    expect(html).not.toMatch(/comprobante fue recibido|te avisaremos por correo|revisa la carpeta de spam/i);
    expect(html).toContain("Esto es una demo: no se guarda ninguna reserva");
    expect(html).toContain("Crea tu propia rifa gratis");
  });
});
