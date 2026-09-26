import { describe, expect, it } from "vitest";
import { mapAuthError, resetRequestErrorMessage, GENERIC_AUTH_ERROR } from "../lib/auth/auth-errors";

describe("mapAuthError", () => {
  it("maps known Supabase error codes to fixed Spanish messages", () => {
    expect(mapAuthError({ code: "invalid_credentials", message: "Invalid login credentials" }, "sign-in")).toBe(
      "Correo o contraseña incorrectos."
    );
    expect(mapAuthError({ code: "email_not_confirmed" }, "sign-in")).toBe(
      "Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada."
    );
    expect(mapAuthError({ code: "over_request_rate_limit" }, "sign-in")).toMatch(/Demasiados intentos/);
    expect(mapAuthError({ code: "over_email_send_rate_limit" }, "reset-request")).toMatch(/Demasiados intentos/);
    expect(mapAuthError({ code: "weak_password" }, "sign-up")).toMatch(/contraseña/i);
    expect(mapAuthError({ code: "same_password" }, "reset")).toBe("Elige una contraseña distinta a la anterior.");
  });

  it("never reflects raw error text for unknown codes", () => {
    const raw = "<script>alert(1)</script> user@example.com already registered";
    const message = mapAuthError({ code: "some_new_code", message: raw }, "sign-in");
    expect(message).toBe(GENERIC_AUTH_ERROR);
    expect(message).not.toContain("script");
    expect(message).not.toContain("example.com");
  });

  it("falls back to the generic message when there is no code", () => {
    expect(mapAuthError({ message: "boom" }, "sign-up")).toBe(GENERIC_AUTH_ERROR);
    expect(mapAuthError(null, "sign-up")).toBe(GENERIC_AUTH_ERROR);
  });

  it("does not reveal whether an account exists on sign-up", () => {
    // Supabase can surface user_already_exists / email_exists; both collapse to generic.
    expect(mapAuthError({ code: "user_already_exists" }, "sign-up")).toBe(GENERIC_AUTH_ERROR);
    expect(mapAuthError({ code: "email_exists" }, "sign-up")).toBe(GENERIC_AUTH_ERROR);
  });

  it("does not reveal whether an account exists on reset request", () => {
    expect(mapAuthError({ code: "user_not_found" }, "reset-request")).toBe(GENERIC_AUTH_ERROR);
    expect(mapAuthError({ code: "email_address_invalid" }, "reset-request")).toBe(GENERIC_AUTH_ERROR);
  });

  it("uses a fixed message for expired or invalid recovery sessions", () => {
    expect(mapAuthError({ code: "session_not_found" }, "reset")).toMatch(/enlace/);
    expect(mapAuthError({ code: "reauthentication_needed" }, "reset")).toMatch(/enlace/);
  });
});

describe("resetRequestErrorMessage", () => {
  it("surfaces only rate limiting; every other outcome must look like success", () => {
    expect(resetRequestErrorMessage({ code: "over_email_send_rate_limit" })).toMatch(/Demasiados intentos/);
    expect(resetRequestErrorMessage({ code: "user_not_found" })).toBeNull();
    expect(resetRequestErrorMessage({ code: "email_address_invalid" })).toBeNull();
    expect(resetRequestErrorMessage({ message: "boom" })).toBeNull();
    expect(resetRequestErrorMessage(null)).toBeNull();
  });
});
