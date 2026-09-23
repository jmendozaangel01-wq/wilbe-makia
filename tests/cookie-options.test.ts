import { afterEach, describe, expect, it } from "vitest";
import { getAuthCookieOptions } from "../lib/supabase/cookie-options";

// Auth cookies are host-scoped by default, so a session created on the apex
// (where Google sign-in and onboarding happen) would not follow the user to
// <tenant>.<apex>/admin. NEXT_PUBLIC_COOKIE_DOMAIN (e.g. ".rifamakia.com")
// opts into a shared-parent-domain cookie; unset keeps host-only cookies,
// which is what localhost dev needs.

const original = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
  else process.env.NEXT_PUBLIC_COOKIE_DOMAIN = original;
});

describe("getAuthCookieOptions", () => {
  it("returns no domain when the env var is unset or blank", () => {
    delete process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
    expect(getAuthCookieOptions()).toEqual({});
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = "  ";
    expect(getAuthCookieOptions()).toEqual({});
  });

  it("returns the configured parent domain", () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = ".rifamakia.com";
    expect(getAuthCookieOptions()).toEqual({ domain: ".rifamakia.com" });
  });
});
