import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  looksLikeEmail,
  shouldRevealPassword,
  validateEmail,
  validateNewPassword,
  validateSignInInput,
  validateSignUpInput,
} from "../lib/auth/validation";

describe("looksLikeEmail / shouldRevealPassword", () => {
  it.each(["a@b.co", "jairo@example.com", "  jairo@example.com  ", "first.last+tag@sub.example.co"])(
    "accepts %j",
    (value) => {
      expect(looksLikeEmail(value)).toBe(true);
      expect(shouldRevealPassword(value)).toBe(true);
    }
  );

  it.each(["", "   ", "jairo", "jairo@", "@example.com", "jairo@example", "jairo@example.", "a b@example.com", "a@@b.co", "a@b.c"])(
    "rejects %j",
    (value) => {
      expect(looksLikeEmail(value)).toBe(false);
      expect(shouldRevealPassword(value)).toBe(false);
    }
  );

  it("rejects absurdly long values", () => {
    expect(looksLikeEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});

describe("validateEmail", () => {
  it("returns null for a valid address and a fixed message otherwise", () => {
    expect(validateEmail("a@b.co")).toBeNull();
    expect(validateEmail("nope")).toBe("Ingresa un correo válido.");
  });
});

describe("validateNewPassword", () => {
  it("enforces the 8..72 length window", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(validateNewPassword("1234567")).toBe("La contraseña debe tener al menos 8 caracteres.");
    expect(validateNewPassword("12345678")).toBeNull();
    expect(validateNewPassword("x".repeat(PASSWORD_MAX_LENGTH))).toBeNull();
    expect(validateNewPassword("x".repeat(PASSWORD_MAX_LENGTH + 1))).toBe(
      "La contraseña no puede superar los 72 caracteres."
    );
  });
});

describe("validateSignInInput", () => {
  it("requires a valid email and a non-empty password", () => {
    expect(validateSignInInput({ email: "bad", password: "x" })).toEqual({ field: "email", message: "Ingresa un correo válido." });
    expect(validateSignInInput({ email: "a@b.co", password: "" })).toEqual({
      field: "password",
      message: "Ingresa tu contraseña.",
    });
    expect(validateSignInInput({ email: "a@b.co", password: "x" })).toBeNull();
  });

  it("does not apply the length rule at sign-in (legacy passwords must still work)", () => {
    expect(validateSignInInput({ email: "a@b.co", password: "abc" })).toBeNull();
  });
});

describe("validateSignUpInput", () => {
  const ok = { email: "a@b.co", password: "12345678", confirm: "12345678" };

  it("passes with valid input", () => {
    expect(validateSignUpInput(ok)).toBeNull();
  });

  it("flags email, password length and mismatch, in that order", () => {
    expect(validateSignUpInput({ ...ok, email: "x" })?.field).toBe("email");
    expect(validateSignUpInput({ ...ok, password: "123", confirm: "123" })?.field).toBe("password");
    expect(validateSignUpInput({ ...ok, confirm: "87654321" })).toEqual({
      field: "confirm",
      message: "Las contraseñas no coinciden.",
    });
  });
});
