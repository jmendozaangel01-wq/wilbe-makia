import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The config tab is the only place a tenant edits its raffle, so it links to
// the public page the buyers see. Renders without a database or a server
// action: the action module is mocked away.

vi.mock("@/app/admin/config-actions", () => ({ updateRaffleConfig: vi.fn() }));

const { default: ConfiguracionTab } = await import("../components/admin/ConfiguracionTab");

const raffle = {
  raffleName: "Rifa Demo",
  premioNombre: "Gánate una moto XTZ 660 0-KM",
  maxNumero: 999,
  precioPorNumero: "1000",
  sorteoFecha: "31 DIC 2026",
  nequiNumero: "3001112222",
  nequiNombre: "Titular",
  numerosBendecidos: "1, 2, 3",
};

describe("ConfiguracionTab raffle link", () => {
  it("links to the tenant's public raffle in a new tab, without leaking the opener", () => {
    const html = renderToStaticMarkup(
      createElement(ConfiguracionTab, {
        raffle,
        logoUrl: null,
        qrUrl: null,
        premioImagenUrl: null,
        raffleUrl: "https://mrjota.benditarifa.com/",
      })
    );

    expect(html).toContain('href="https://mrjota.benditarifa.com/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Ver mi rifa");
  });

  it("renders no link when there is no raffle URL", () => {
    const html = renderToStaticMarkup(
      createElement(ConfiguracionTab, { raffle, logoUrl: null, qrUrl: null, premioImagenUrl: null, raffleUrl: null })
    );

    expect(html).not.toContain("Ver mi rifa");
  });
});

describe("ConfiguracionTab prize fields", () => {
  it("renders the prize title input prefilled and a prize photo file input named 'premio'", () => {
    const html = renderToStaticMarkup(
      createElement(ConfiguracionTab, { raffle, logoUrl: null, qrUrl: null, premioImagenUrl: null, raffleUrl: null })
    );

    expect(html).toContain("Título de la rifa");
    expect(html).toContain('name="premioNombre"');
    expect(html).toContain('value="Gánate una moto XTZ 660 0-KM"');
    expect(html).toContain('name="premio"');
    expect(html).toContain("Sin foto del premio");
  });

  it("previews the current prize photo when one is saved", () => {
    const html = renderToStaticMarkup(
      createElement(ConfiguracionTab, {
        raffle,
        logoUrl: null,
        qrUrl: null,
        premioImagenUrl: "https://example.com/premio.png",
        raffleUrl: null,
      })
    );

    expect(html).toContain('src="https://example.com/premio.png"');
    expect(html).not.toContain("Sin foto del premio");
  });
});
