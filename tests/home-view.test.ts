import { describe, expect, it } from "vitest";
import { selectHomeView } from "../lib/tenant/home-view";

// Pure unit tests -- no DB required.

describe("selectHomeView", () => {
  it("shows the marketing landing on the bare apex domain", () => {
    expect(selectHomeView("benditarifa.com")).toBe("marketing");
  });

  it("shows the marketing landing on www, with or without a port", () => {
    expect(selectHomeView("www.benditarifa.com")).toBe("marketing");
    expect(selectHomeView("benditarifa.com:3000")).toBe("marketing");
  });

  it("shows the marketing landing on plain localhost for local dev", () => {
    expect(selectHomeView("localhost:3000")).toBe("marketing");
  });

  it("keeps rendering the tenant raffle on tenant subdomains", () => {
    expect(selectHomeView("acme.benditarifa.com")).toBe("tenant");
    expect(selectHomeView("acme.localhost:3000")).toBe("tenant");
  });

  it("keeps rendering the tenant page (default branding) on reserved subdomains", () => {
    expect(selectHomeView("admin.benditarifa.com")).toBe("tenant");
  });

  it("keeps the tenant page when the Host header is missing", () => {
    expect(selectHomeView(null)).toBe("tenant");
    expect(selectHomeView(undefined)).toBe("tenant");
  });
});
