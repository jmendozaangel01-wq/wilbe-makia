import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Phase 6: the admin login is Google-only. These tests render the client
// component to static markup (node environment, no DOM) and assert that no
// password sign-in surface remains while the Google button and the callback
// error message stay.

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: {} }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

const { default: LoginForm } = await import("../components/admin/LoginForm");

function render(props: { orgName: string; initialError?: string | null }) {
  return renderToStaticMarkup(createElement(LoginForm, props));
}

describe("LoginForm (Google-only)", () => {
  it("renders the Google sign-in button and the org name", () => {
    const html = render({ orgName: "Acme" });
    expect(html).toContain("Continuar con Google");
    expect(html).toContain("Acme");
  });

  it("renders no email/password inputs or password copy", () => {
    const html = render({ orgName: "Acme" });
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain("Contraseña");
    expect(html).not.toContain("correo y contraseña");
    expect(html).not.toContain("Ingresar");
  });

  it("renders no submit button (Google button is type=button only)", () => {
    const html = render({ orgName: "Acme" });
    expect(html).not.toContain('type="submit"');
  });

  it("shows the initial callback error when provided", () => {
    const html = render({ orgName: "Acme", initialError: "No pudimos iniciar tu sesión. Intenta de nuevo." });
    expect(html).toContain("No pudimos iniciar tu sesión. Intenta de nuevo.");
  });

  it("shows no error block when none is provided", () => {
    const html = render({ orgName: "Acme" });
    expect(html).not.toContain("Intenta de nuevo");
  });
});
