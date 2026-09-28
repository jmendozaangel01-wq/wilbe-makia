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
      createElement(ConfiguracionTab, { raffle, logoUrl: null, qrUrl: null, raffleUrl: "https://mrjota.benditarifa.com/" })
    );

    expect(html).toContain('href="https://mrjota.benditarifa.com/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Ver mi rifa");
  });

  it("renders no link when there is no raffle URL", () => {
    const html = renderToStaticMarkup(
      createElement(ConfiguracionTab, { raffle, logoUrl: null, qrUrl: null, raffleUrl: null })
    );

    expect(html).not.toContain("Ver mi rifa");
  });
});
