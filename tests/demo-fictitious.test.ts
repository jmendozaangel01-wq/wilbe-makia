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
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
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
    expect(src).not.toMatch(/from\s+["'][^"']*supabase/i);
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
    await expect(Home()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.resolveOrganizationByHost).toHaveBeenCalledWith("acme.benditarifa.com");
  });

  it("returns 404 for a subdomain that maps to no organization, instead of rendering a fake raffle page", async () => {
    mocks.host = "wber-makia.benditarifa.com";
    mocks.resolveOrganizationByHost.mockResolvedValue(null);
    await expect(Home()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("keeps rendering (fail-soft) when tenant resolution itself errors, so a DB blip does not 404 real raffles", async () => {
    mocks.host = "acme.benditarifa.com";
    mocks.resolveOrganizationByHost.mockRejectedValue(new Error("db down"));
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("no está disponible en este momento");
  });
});

describe("tenant home render uses this tenant's real data, not lib/constants", () => {
  // Fakes just enough of the Supabase query-builder chain that
  // loadBlessedNumbersData()/loadActiveRaffleForBuyer() (app/page.tsx) call,
  // per table: numeros' chain ends in a plain awaited value (array select),
  // raffles' chain ends in .maybeSingle().
  function fakeAdminClient(rows: { numeros: unknown; raffle: unknown }) {
    return {
      from: (table: string) => {
        if (table === "numeros") {
          return { select: () => ({ eq: () => ({ eq: () => rows.numeros }) }) };
        }
        if (table === "raffles") {
          return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => rows.raffle }) }) }) };
        }
        throw new Error(`unexpected table in test fake: ${table}`);
      },
    };
  }

  it("renders this tenant's own price/Nequi/sorteo instead of the legacy hardcoded values", async () => {
    mocks.host = "acme.benditarifa.com";
    mocks.resolveOrganizationByHost.mockResolvedValue({
      id: "org-acme",
      subdomain: "acme",
      nombre: "Rifa Acme",
      logoUrl: null,
      colorPrimario: null,
      isPlatformOwner: false,
      subscriptionStatus: "active",
      trialEndsAt: null,
    });
    mocks.createAdminClient.mockReturnValue(
      fakeAdminClient({
        numeros: { data: [], error: null },
        raffle: {
          data: {
            precio_por_numero: 777,
            paquetes: [{ tipo: "paquete_10", qty: 10, price: 7770 }],
            nequi_numero: "3001112222",
            nequi_nombre: "Acme Titular",
            qr_url: null,
            sorteo_fecha: "31 DIC 2026",
            premio_nombre: "Gánate una bicicleta Acme",
            premio_imagen_url: null,
          },
          error: null,
        },
      })
    );

    const html = renderToStaticMarkup(await Home());

    // The Nequi/QR payment box only mounts once a package is picked (client
    // state in RifaFlow), so a static pre-selection render can't observe it
    // here -- covered instead by the "ReservationForm payment box" tests
    // above, which mount it directly with explicit props. This render does
    // cover Hero (price, sorteo) and the package cards (from raffles.paquetes).
    expect(html).toContain("$777");
    expect(html).toContain("31 DIC 2026");
    expect(html).toContain("$7.770"); // paquete_10 price, from raffles.paquetes, not PAQUETES
    // The prize title and the nav brand are this tenant's own too: none of the
    // first tenant's hardcoded values may leak into a tenant that didn't
    // configure them ("Jairo Mendoza" is only a legacy Nequi holder here, the
    // raffle's own holder is "Acme Titular").
    expect(html).toContain("Gánate una bicicleta Acme");
    expect(html).toContain("Rifa Acme");
    for (const s of ["3015649719", "Jairo Mendoza", "XTZ", "Wilber", "WILBER", "moto-hero"]) {
      expect(html).not.toContain(s);
    }
    // No prize photo configured: no prize image block at all.
    expect(html).not.toContain("<img");
  });

  it("renders the tenant's prize photo as a plain img only when premio_imagen_url is set", async () => {
    mocks.host = "pic.benditarifa.com";
    mocks.resolveOrganizationByHost.mockResolvedValue({
      id: "org-pic",
      subdomain: "pic",
      nombre: "Rifa Foto",
      logoUrl: null,
      colorPrimario: null,
      isPlatformOwner: false,
      subscriptionStatus: "active",
      trialEndsAt: null,
    });
    mocks.createAdminClient.mockReturnValue(
      fakeAdminClient({
        numeros: { data: [], error: null },
        raffle: {
          data: {
            precio_por_numero: 500,
            paquetes: [{ tipo: "paquete_10", qty: 10, price: 5000 }],
            nequi_numero: "3005556666",
            nequi_nombre: "Titular Foto",
            qr_url: null,
            sorteo_fecha: "1 ENE 2027",
            premio_nombre: "Un carro de ejemplo",
            premio_imagen_url: "https://example.supabase.co/storage/v1/object/public/logos/org-pic/premio-1.png",
          },
          error: null,
        },
      })
    );

    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("Un carro de ejemplo");
    expect(html).toContain('src="https://example.supabase.co/storage/v1/object/public/logos/org-pic/premio-1.png"');
    for (const s of ["XTZ", "Wilber", "WILBER", "moto-hero"]) expect(html).not.toContain(s);
  });

  it("drops a malformed stored prize photo URL instead of rendering it", async () => {
    mocks.host = "bad.benditarifa.com";
    mocks.resolveOrganizationByHost.mockResolvedValue({
      id: "org-bad",
      subdomain: "bad",
      nombre: "Rifa Mala",
      logoUrl: null,
      colorPrimario: null,
      isPlatformOwner: false,
      subscriptionStatus: "active",
      trialEndsAt: null,
    });
    mocks.createAdminClient.mockReturnValue(
      fakeAdminClient({
        numeros: { data: [], error: null },
        raffle: {
          data: {
            precio_por_numero: 500,
            paquetes: [{ tipo: "paquete_10", qty: 10, price: 5000 }],
            nequi_numero: "3005556666",
            nequi_nombre: "Titular Malo",
            qr_url: null,
            sorteo_fecha: "1 ENE 2027",
            premio_nombre: "Premio sin foto valida",
            premio_imagen_url: "javascript:alert(1)",
          },
          error: null,
        },
      })
    );

    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("Premio sin foto valida");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
  });

  it("shows an unavailable state instead of falling back to the legacy constants when the tenant has no active raffle row", async () => {
    mocks.host = "empty.benditarifa.com";
    mocks.resolveOrganizationByHost.mockResolvedValue({
      id: "org-empty",
      subdomain: "empty",
      nombre: "Rifa Vacia",
      logoUrl: null,
      colorPrimario: null,
      isPlatformOwner: false,
      subscriptionStatus: "active",
      trialEndsAt: null,
    });
    mocks.createAdminClient.mockReturnValue(
      fakeAdminClient({ numeros: { data: [], error: null }, raffle: { data: null, error: null } })
    );

    const html = renderToStaticMarkup(await Home());

    // Post-review fix: a transient fetch failure or a tenant with no active
    // raffle used to fail-soft into showing the platform owner's own Nequi
    // account/price/packages to buyers -- a real money-misdirection risk.
    // It must now render a clear "unavailable" state instead, never any of
    // the legacy constant values.
    expect(html).toContain("no está disponible en este momento");
    expect(html).not.toContain("$200"); // PRICE_PER_NUMBER
    expect(html).not.toContain("15 OCT 2026"); // SORTEO_FECHA
    expect(html).not.toContain("$13.000"); // PAQUETES' paquete_65 price
    expect(html).not.toContain("3015649719"); // NEQUI_NUMERO
    expect(html).not.toContain("Jairo Mendoza"); // NEQUI_NOMBRE
  });

  it("shows the same unavailable state when the raffle exists but has no packages configured", async () => {
    mocks.host = "nopkg.benditarifa.com";
    mocks.resolveOrganizationByHost.mockResolvedValue({
      id: "org-nopkg",
      subdomain: "nopkg",
      nombre: "Rifa Sin Paquetes",
      logoUrl: null,
      colorPrimario: null,
      isPlatformOwner: false,
      subscriptionStatus: "active",
      trialEndsAt: null,
    });
    mocks.createAdminClient.mockReturnValue(
      fakeAdminClient({
        numeros: { data: [], error: null },
        raffle: {
          data: {
            precio_por_numero: 500,
            paquetes: [],
            nequi_numero: "3005556666",
            nequi_nombre: "Alguien",
            qr_url: null,
            sorteo_fecha: "1 ENE 2027",
          },
          error: null,
        },
      })
    );

    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("no está disponible en este momento");
    expect(html).not.toContain("3015649719");
    expect(html).not.toContain("Jairo Mendoza");
    expect(html).not.toContain("$200");
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

  it("real mode shows the tenant's own Nequi number/name, no longer a hardcoded default", () => {
    const html = renderToStaticMarkup(
      createElement(ReservationForm, {
        ...base,
        state: { status: "idle" },
        nequiNumero: "3015649719",
        nequiNombre: "Jairo Mendoza",
      })
    );
    expect(html).toContain("3015649719");
    expect(html).toContain("Jairo Mendoza");
  });

  it("real mode with no qrUrl shows a text fallback, never a real tenant's QR image", () => {
    const html = renderToStaticMarkup(
      createElement(ReservationForm, {
        ...base,
        state: { status: "idle" },
        nequiNumero: "3009998888",
        nequiNombre: "Otro Titular",
        qrUrl: null,
      })
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("Paga desde la app Nequi");
  });

  it("real mode with a qrUrl renders it as a plain img, not a hardcoded asset", () => {
    const html = renderToStaticMarkup(
      createElement(ReservationForm, {
        ...base,
        state: { status: "idle" },
        nequiNumero: "3009998888",
        nequiNombre: "Otro Titular",
        qrUrl: "https://example.supabase.co/storage/v1/object/public/logos/org-1/qr-abc.png",
      })
    );
    expect(html).toContain("https://example.supabase.co/storage/v1/object/public/logos/org-1/qr-abc.png");
    for (const s of REAL_STRINGS) expect(html).not.toContain(s);
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
