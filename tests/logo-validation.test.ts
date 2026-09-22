import { describe, expect, it } from "vitest";
import { isValidLogoUrl } from "../lib/tenant/logo";

// Unit tests for the render-time (and, once a write path exists, write-time)
// guard between a stored organizations.logo_url value and being rendered as
// an <img src> (components/Hero.tsx, via app/page.tsx) -- the logo_url
// counterpart to tests/color-validation.test.ts's isValidBrandColor()
// coverage (design D7, symmetry noted in Phase 3 post-review).

describe("isValidLogoUrl", () => {
  it("accepts http(s) URLs", () => {
    expect(isValidLogoUrl("https://example.supabase.co/storage/v1/object/public/logos/foo.png")).toBe(true);
    expect(isValidLogoUrl("http://example.com/logo.png")).toBe(true);
  });

  it("rejects javascript: URLs", () => {
    expect(isValidLogoUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects data: URLs", () => {
    expect(isValidLogoUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBe(false);
  });

  it("rejects protocol-relative and scheme-less strings", () => {
    expect(isValidLogoUrl("//evil.example.com/logo.png")).toBe(false);
    expect(isValidLogoUrl("logo.png")).toBe(false);
  });

  it("rejects malformed URLs instead of throwing", () => {
    expect(() => isValidLogoUrl("not a url at all")).not.toThrow();
    expect(isValidLogoUrl("not a url at all")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidLogoUrl("")).toBe(false);
  });

  it("rejects a value longer than the sanity cap", () => {
    expect(isValidLogoUrl("https://example.com/" + "a".repeat(2048))).toBe(false);
  });

  it("rejects non-string input defensively", () => {
    // @ts-expect-error -- deliberately exercising a malformed-data path;
    // a stored DB value is technically typed as string | null upstream, but
    // this guards against any caller that skips the null check.
    expect(isValidLogoUrl(null)).toBe(false);
  });
});
