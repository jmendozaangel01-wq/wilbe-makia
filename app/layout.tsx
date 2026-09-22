import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import { headers } from "next/headers";
import { resolveOrganizationByHost } from "@/lib/tenant/resolve";
import { isValidBrandColor } from "@/lib/tenant/color";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Wilber Makia — Gánate una XTZ 660 0-KM",
  description:
    "Rifa en vivo de una moto XTZ 660 0-KM. Compra tus números por Nequi y participa por $50.000 extra si tienes un número bendecido.",
};

/**
 * Per-request tenant brand override (design D7). app/globals.css's :root
 * values stay as fallback defaults; this <style> block, rendered per
 * request from the resolved tenant's color_primario, overrides just
 * --color-gold when the tenant has one AND it passes isValidBrandColor().
 *
 * Only --color-gold is overridden, not the full --color-* set: the schema
 * (organizations.color_primario, 0006_organizations.sql) currently persists
 * a single primary brand color per tenant, not a full palette, and
 * --color-gold is this template's primary accent (CTA buttons, prices,
 * highlighted text) throughout Hero/RifaFlow/the admin panel. Structural UI
 * colors (charcoal backgrounds, cream text, the red "live" accent) stay
 * fixed defaults -- letting an arbitrary tenant-chosen color reach into
 * those would risk unreadable contrast (e.g. a light color_primario against
 * the charcoal background) for zero product benefit.
 *
 * SECURITY: color_primario is user-controlled data reaching raw HTML output
 * via string interpolation. isValidBrandColor() is a strict allowlist
 * (whole-string regex match against hex/oklch() shapes only -- no `<`, `>`,
 * `;`, quotes, or backslashes are ever part of a match) -- see
 * lib/tenant/color.ts for the full rationale and tests/color-validation.test.ts
 * for injection-payload coverage. An invalid/malformed stored value is
 * silently treated as "no override" (falls back to the :root default)
 * rather than thrown -- a bad value in the database must never crash every
 * page for that tenant.
 */
async function BrandStyle() {
  const headerList = await headers();
  const host = headerList.get("host");
  const org = host ? await resolveOrganizationByHost(host) : null;

  const color = org?.colorPrimario;
  if (!color || !isValidBrandColor(color)) {
    return null;
  }

  return <style>{`:root { --color-gold: ${color}; }`}</style>;
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${anton.variable} ${inter.variable} h-full antialiased scroll-smooth`}>
      <head>
        <BrandStyle />
      </head>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) inject attributes like
          cz-shortcut-listen onto <body> before hydration, which is a false-positive mismatch */}
      <body className="min-h-full flex flex-col bg-charcoal text-cream" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
