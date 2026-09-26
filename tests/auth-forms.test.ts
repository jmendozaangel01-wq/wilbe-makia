import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Static-markup coverage for the sign-up, forgot-password and reset screens
// and the shared password field. Interactive behaviour (submit, reveal) is
// pure logic covered in auth-validation/auth-errors tests.

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: {} }),
}));

const { default: SignUpForm } = await import("../components/auth/SignUpForm");
const { default: ForgotPasswordForm } = await import("../components/auth/ForgotPasswordForm");
const { default: ResetPasswordForm } = await import("../components/auth/ResetPasswordForm");
const { default: PasswordField } = await import("../components/auth/PasswordField");

const noop = () => {};

describe("PasswordField", () => {
  it("renders a labelled password input with an accessible show/hide toggle", () => {
    const html = renderToStaticMarkup(
      createElement(PasswordField, { id: "pw", label: "Contraseña", value: "", onChange: noop, autoComplete: "new-password" })
    );
    expect(html).toMatch(/<label[^>]*for="pw"[^>]*>Contraseña<\/label>/);
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('aria-label="Mostrar contraseña"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-controls="pw"');
  });

  it("links the error to the input and announces it", () => {
    const html = renderToStaticMarkup(
      createElement(PasswordField, { id: "pw", label: "Contraseña", value: "", onChange: noop, autoComplete: "new-password", error: "Muy corta" })
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="pw-error"');
    expect(html).toMatch(/id="pw-error"[^>]*role="alert"|role="alert"[^>]*id="pw-error"/);
  });
});

describe("SignUpForm", () => {
  const html = renderToStaticMarkup(createElement(SignUpForm));

  it("asks for email, password and confirmation with the length hint", () => {
    expect(html).toContain('type="email"');
    expect(html).toContain("Confirma tu contraseña");
    expect(html.match(/type="password"/g)).toHaveLength(2);
    expect(html).toContain("Mínimo 8 caracteres");
    expect(html).toContain('autoComplete="new-password"');
  });

  it("offers Google, the create-account button and a link back to sign in", () => {
    expect(html).toContain("Continuar con Google");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>[^<]*Crear cuenta/);
    expect(html).toContain('href="/admin/login"');
    expect(html).toContain("¿Ya tienes cuenta?");
  });
});

describe("ForgotPasswordForm", () => {
  it("asks only for the email and links back to sign in", () => {
    const html = renderToStaticMarkup(createElement(ForgotPasswordForm));
    expect(html).toContain('type="email"');
    expect(html).not.toContain('type="password"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>[^<]*Enviar enlace/);
    expect(html).toContain('href="/admin/login"');
  });
});

describe("ResetPasswordForm", () => {
  it("starts in a neutral checking state (no form before the recovery session is verified)", () => {
    const html = renderToStaticMarkup(createElement(ResetPasswordForm));
    expect(html).toContain("Verificando enlace");
    expect(html).not.toContain('type="password"');
  });
});
