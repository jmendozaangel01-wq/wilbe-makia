import { describe, expect, it } from "vitest";
import { DEFAULT_APEX_DOMAIN, isReservedSubdomain, parseSubdomain } from "../lib/tenant/subdomain";

// Pure unit tests -- no DB required, unlike the other suites under tests/.

describe("parseSubdomain", () => {
  it("resolves the bare apex domain to the apex tenant (tenant zero)", () => {
    expect(parseSubdomain("benditarifa.com")).toEqual({ kind: "apex" });
  });

  it("resolves www to the apex tenant, not a reserved/unknown host", () => {
    expect(parseSubdomain("www.benditarifa.com")).toEqual({ kind: "apex" });
  });

  it("extracts a real tenant subdomain", () => {
    expect(parseSubdomain("acme.benditarifa.com")).toEqual({ kind: "tenant", subdomain: "acme" });
  });

  it("extracts a tenant subdomain regardless of a trailing port", () => {
    expect(parseSubdomain("acme.benditarifa.com:3000")).toEqual({ kind: "tenant", subdomain: "acme" });
  });

  it("is case-insensitive", () => {
    expect(parseSubdomain("ACME.BENDITARIFA.COM")).toEqual({ kind: "tenant", subdomain: "acme" });
  });

  it("classifies each reserved word as reserved, not a tenant", () => {
    for (const word of ["admin", "app", "api", "auth", "static"]) {
      expect(parseSubdomain(`${word}.benditarifa.com`)).toEqual({ kind: "reserved", subdomain: word });
    }
  });

  it("resolves bare localhost (no subdomain) to the apex tenant", () => {
    expect(parseSubdomain("localhost:3000")).toEqual({ kind: "apex" });
    expect(parseSubdomain("127.0.0.1:3000")).toEqual({ kind: "apex" });
  });

  it("extracts a tenant subdomain from a *.localhost dev host", () => {
    expect(parseSubdomain("acme.localhost:3000")).toEqual({ kind: "tenant", subdomain: "acme" });
  });

  it("classifies a reserved word under *.localhost as reserved", () => {
    expect(parseSubdomain("admin.localhost:3000")).toEqual({ kind: "reserved", subdomain: "admin" });
  });

  it("falls back to apex for a host that doesn't match the apex domain at all (Vercel preview host)", () => {
    expect(parseSubdomain("rifamakia-git-feature-branch-team.vercel.app")).toEqual({ kind: "apex" });
  });

  it("accepts a custom apex domain parameter instead of the default", () => {
    expect(parseSubdomain("acme.example.com", "example.com")).toEqual({ kind: "tenant", subdomain: "acme" });
    expect(parseSubdomain("acme.benditarifa.com", "example.com")).toEqual({ kind: "apex" });
  });

  it("exposes the default apex domain used when none is passed", () => {
    expect(DEFAULT_APEX_DOMAIN).toBe("benditarifa.com");
  });
});

describe("isReservedSubdomain", () => {
  it("flags every word on the reserved list, including www", () => {
    for (const word of ["www", "admin", "app", "api", "auth", "static"]) {
      expect(isReservedSubdomain(word)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isReservedSubdomain("ADMIN")).toBe(true);
  });

  it("does not flag a real tenant subdomain as reserved", () => {
    expect(isReservedSubdomain("acme")).toBe(false);
  });
});
