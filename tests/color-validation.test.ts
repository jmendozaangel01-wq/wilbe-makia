import { describe, expect, it } from "vitest";
import { isValidBrandColor } from "../lib/tenant/color";

// Unit tests for the sole render-time (and, once a write path exists,
// write-time) guard between a stored organizations.color_primario value and
// raw interpolation into app/layout.tsx's <style> tag (design D7, task
// 3.1). The injection-payload cases below are the actual security property
// being verified: a malicious/malformed stored value must never match, so
// it can never reach the <style> tag content at all.

describe("isValidBrandColor", () => {
  it("accepts the existing app/globals.css oklch() values verbatim", () => {
    expect(isValidBrandColor("oklch(0.80 0.14 85)")).toBe(true);
    expect(isValidBrandColor("oklch(0.15 0.014 40)")).toBe(true);
    expect(isValidBrandColor("oklch(0.52 0.21 26)")).toBe(true);
  });

  it("accepts oklch() with an alpha channel", () => {
    expect(isValidBrandColor("oklch(0.80 0.14 85 / 0.5)")).toBe(true);
    expect(isValidBrandColor("oklch(0.80 0.14 85 / 50%)")).toBe(true);
  });

  it("accepts oklch() with percentage components and a deg hue unit", () => {
    expect(isValidBrandColor("oklch(80% 0.14 85deg)")).toBe(true);
  });

  it("accepts 3/4/6/8-digit hex colors", () => {
    expect(isValidBrandColor("#fff")).toBe(true);
    expect(isValidBrandColor("#fff8")).toBe(true);
    expect(isValidBrandColor("#ff8800")).toBe(true);
    expect(isValidBrandColor("#ff8800cc")).toBe(true);
  });

  it("rejects a </style> tag-breakout payload", () => {
    expect(isValidBrandColor("red</style><script>alert(1)</script>")).toBe(false);
  });

  it("rejects an oklch()-shaped payload smuggling a tag breakout after valid-looking numbers", () => {
    expect(isValidBrandColor("oklch(0.8 0.1 85)</style><script>alert(1)</script>")).toBe(false);
  });

  it("rejects css injection via extra declarations", () => {
    expect(isValidBrandColor("red; } body { display: none")).toBe(false);
  });

  it("rejects url()/expression()-style payloads", () => {
    expect(isValidBrandColor("url(javascript:alert(1))")).toBe(false);
  });

  it("rejects plain css color keywords (not in the allowed hex/oklch shapes)", () => {
    expect(isValidBrandColor("red")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidBrandColor("")).toBe(false);
  });

  it("rejects a value longer than the sanity cap", () => {
    expect(isValidBrandColor("#" + "f".repeat(1000))).toBe(false);
  });

  it("rejects non-string input defensively", () => {
    // @ts-expect-error -- deliberately exercising a malformed-data path;
    // a stored DB value is technically typed as string | null upstream, but
    // this guards against any caller that skips the null check.
    expect(isValidBrandColor(null)).toBe(false);
  });
});
