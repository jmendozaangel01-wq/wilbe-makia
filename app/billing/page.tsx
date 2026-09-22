import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Placeholder landing page for a lapsed-subscription redirect target
 * (middleware.ts's UX-only subscription gate, design D3). This is
 * intentionally minimal -- the full gated-tenant billing/upgrade experience
 * (plan selection, payment provider integration) is Phase 5 territory
 * (design File Changes: `app/billing/*` | Create | "gated-tenant landing
 * page"). Phase 3 only needs a real route to exist so the middleware
 * redirect has somewhere valid to send a lapsed admin instead of a 404.
 */
export default function BillingPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "clamp(16px, 6vw, 24px)",
        background: "oklch(0.97 0.003 40)",
        color: "oklch(0.20 0.01 40)",
      }}
    >
      <div style={{ maxWidth: "420px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800 }}>Suscripción inactiva</h1>
        <p style={{ fontSize: "14px", color: "oklch(0.45 0.01 40)" }}>
          Tu periodo de prueba terminó o tu suscripción no está activa. Contacta al soporte de la plataforma para
          reactivar el acceso al panel de administración.
        </p>
      </div>
    </div>
  );
}
