import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The admin login offers Google and email + password. These tests render the
// client component to static markup (node environment, no DOM): they cover the
// initial surface, the "password reveals once the email looks valid" rule (via
// the initialEmail prop) and the error announcement.

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: {} }),
}));

const { default: LoginForm } = await import("../components/admin/LoginForm");

function render(props: { initialEmail?: string; initialError?: string | null } = {}) {
  return renderToStaticMarkup(createElement(LoginForm, props));
}

describe("LoginForm", () => {
  it("is branded Bendita Rifa, not a single tenant", () => {
    const html = render();
    expect(html).toContain("Bendita Rifa");
    expect(html).not.toContain("Wilber");
    expect(html).not.toContain("ADMIN");
  });

  it("renders the Google button with the real G logo and no GitHub option", () => {
    const html = render();
    expect(html).toContain("Continuar con Google");
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/github/i);
  });

  it("renders a labelled email field and the o divider", () => {
    const html = render();
    expect(html).toMatch(/<label[^>]*for="login-email"[^>]*>Correo electrónico<\/label>/);
    expect(html).toContain('type="email"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain(">o<");
  });

  it("keeps the password field hidden until the email looks valid", () => {
    const html = render();
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("¿Olvidaste tu contraseña?");
  });

  it("does not reveal the password field for an invalid email", () => {
    expect(render({ initialEmail: "jairo@" })).not.toContain('type="password"');
  });

  it("reveals the password field, eye toggle and forgot link for a valid email", () => {
    const html = render({ initialEmail: "jairo@example.com" });
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('aria-label="Mostrar contraseña"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('href="/auth/olvide"');
    expect(html).toContain("¿Olvidaste tu contraseña?");
  });

  it("has a submit button and a link to sign up", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>[^<]*Iniciar sesión/);
    expect(html).toContain('href="/auth/registro"');
    expect(html).toContain("¿No tienes cuenta?");
  });

  it("never uses voseo", () => {
    const html = render({ initialEmail: "jairo@example.com" });
    expect(html).not.toMatch(/Iniciá|Registrate|Ingresá|Revisá|Elegí|Tenés|Podés/);
  });

  it("shows the callback error as an announced alert", () => {
    const html = render({ initialError: "No pudimos iniciar tu sesión. Intenta de nuevo." });
    expect(html).toMatch(/role="alert"[^>]*>No pudimos iniciar tu sesión\. Intenta de nuevo\./);
  });

  it("shows no alert when there is no error", () => {
    expect(render()).not.toContain('role="alert"');
  });

  it("links the legal note as plain text (no placeholder pages)", () => {
    const html = render();
    expect(html).toContain("Al continuar aceptas los Términos y la Política de privacidad");
    expect(html).not.toContain('href="/terminos"');
  });
});
