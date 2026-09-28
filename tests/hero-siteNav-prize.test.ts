import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Hero from "../components/Hero";
import SiteNav from "../components/SiteNav";

// The public page used to hardcode the first tenant's prize ("XTZ 660",
// /moto-hero.jpg) and brand ("WILBER MAKIA") for every tenant. Both now come
// from the tenant's own data. DB-free: plain component renders.

const LEGACY_STRINGS = ["XTZ", "moto-hero", "WILBER", "MAKIA", "GÁNATE UNA"];

function renderHero(props: Partial<Parameters<typeof Hero>[0]> = {}) {
  return renderToStaticMarkup(createElement(Hero, { orgName: "Rifas Acme", logoUrl: null, ...props }));
}

describe("Hero prize", () => {
  it("shows the raffle's title exactly as typed, with no fixed prefix", () => {
    const html = renderHero({ premioNombre: "Dos motos NKD 125 0-KM" });
    expect(html).toContain("Dos motos NKD 125 0-KM");
    for (const s of LEGACY_STRINGS) expect(html).not.toContain(s);
  });

  it("renders no image block at all when there is no prize photo", () => {
    const html = renderHero({ premioNombre: "Una bicicleta", premioImagenUrl: null });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("border-gold rounded-[10px]");
  });

  it("renders the prize photo as a plain img with the title as alt text when a URL is set", () => {
    const url = "https://example.supabase.co/storage/v1/object/public/logos/org-1/premio-abc.png";
    const html = renderHero({ premioNombre: "Una bicicleta", premioImagenUrl: url });
    expect(html).toContain(`src="${url}"`);
    expect(html).toContain('alt="Una bicicleta"');
    for (const s of LEGACY_STRINGS) expect(html).not.toContain(s);
  });

  it("falls back to the organization name as heading, with no image, when there is no raffle", () => {
    const html = renderHero();
    expect(html).toMatch(/<h1[^>]*>Rifas Acme<\/h1>/);
    expect(html).not.toContain("<img");
    for (const s of LEGACY_STRINGS) expect(html).not.toContain(s);
  });

  it("keeps the headingAs prop", () => {
    expect(renderHero({ premioNombre: "Premio", headingAs: "h2" })).toMatch(/<h2[^>]*>Premio<\/h2>/);
    expect(renderHero({ premioNombre: "Premio" })).toMatch(/<h1[^>]*>Premio<\/h1>/);
  });

  it("still renders the org logo independently of the prize photo", () => {
    const html = renderHero({ premioNombre: "Premio", logoUrl: "https://example.com/logo.png" });
    expect(html).toContain('src="https://example.com/logo.png"');
    expect(html).toContain('alt="Rifas Acme"');
  });
});

describe("SiteNav brand", () => {
  it("shows the organization name as plain text", () => {
    const html = renderToStaticMarkup(createElement(SiteNav, { orgName: "Rifas Acme" }));
    expect(html).toContain("Rifas Acme");
    for (const s of LEGACY_STRINGS) expect(html).not.toContain(s);
  });
});
