import { describe, expect, it } from "vitest";
import { getLoginErrorMessage, isLoginErrorCode } from "../lib/auth/login-errors";

describe("login error allowlist", () => {
  it.each(["no_access", "lookup_failed", "oauth_missing_code", "oauth_failed"])("maps %s to a fixed message", (code) => {
    expect(isLoginErrorCode(code)).toBe(true);
    expect(getLoginErrorMessage(code)).toEqual(expect.any(String));
  });

  it.each([null, undefined, "", "<script>alert(1)</script>", "Free text message", "constructor", "__proto__", ["no_access"]])(
    "returns null for non-allowlisted value %j",
    (value) => {
      expect(isLoginErrorCode(value as string | null | undefined)).toBe(false);
      expect(getLoginErrorMessage(value as string | null | undefined)).toBeNull();
    }
  );
});
