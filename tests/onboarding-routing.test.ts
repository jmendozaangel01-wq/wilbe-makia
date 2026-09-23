import { describe, expect, it } from "vitest";
import { buildTenantAdminUrl, safeNextPath } from "../lib/onboarding/routing";

describe("safeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/admin")).toBe("/admin");
    expect(safeNextPath("/onboarding?x=1")).toBe("/onboarding?x=1");
  });

  it.each([null, undefined, "", "admin", "//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\u0000/evil.com", "/ok\tpath", "/a\\b"])(
    "falls back to /admin for unsafe value %j",
    (v) => {
      expect(safeNextPath(v as string | null | undefined)).toBe("/admin");
    }
  );
});

describe("buildTenantAdminUrl", () => {
  it("builds https://<sub>.<apex>/admin for production hosts", () => {
    expect(buildTenantAdminUrl("acme", "benditarifa.com")).toBe("https://acme.benditarifa.com/admin");
    expect(buildTenantAdminUrl("acme", "www.benditarifa.com")).toBe("https://acme.benditarifa.com/admin");
    expect(buildTenantAdminUrl("acme", "beta.benditarifa.com")).toBe("https://acme.benditarifa.com/admin");
  });

  it("uses http and keeps the port on localhost", () => {
    expect(buildTenantAdminUrl("acme", "localhost:3000")).toBe("http://acme.localhost:3000/admin");
    expect(buildTenantAdminUrl("acme", "beta.localhost:3000")).toBe("http://acme.localhost:3000/admin");
  });

  it("accepts a custom path", () => {
    expect(buildTenantAdminUrl("acme", "benditarifa.com", "/onboarding")).toBe("https://acme.benditarifa.com/onboarding");
  });

  it("falls back to a relative path for unknown hosts (e.g. preview deployments)", () => {
    expect(buildTenantAdminUrl("acme", "my-app-git-branch.vercel.app")).toBe("/admin");
  });
});
