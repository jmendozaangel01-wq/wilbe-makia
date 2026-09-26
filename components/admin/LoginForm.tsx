"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface LoginFormProps {
  /** Organization display name (design tenant-branding domain), resolved
   * server-side by app/admin/login/page.tsx -- this component is a client
   * component and cannot resolve the tenant itself. */
  orgName: string;
  /** Message forwarded by /auth/callback when the Google sign-in failed. */
  initialError?: string | null;
}

export default function LoginForm({ orgName, initialError = null }: LoginFormProps) {
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);

  async function onGoogleSignIn() {
    setPending(true);
    setError(null);

    // PKCE: the code verifier cookie is set on THIS host, so the callback
    // must return to the same origin -- hence window.location.origin instead
    // of a fixed URL. Each tenant host (or a wildcard) must be in Supabase's
    // redirect allow-list.
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (oauthError) {
      setError(oauthError.message);
      setPending(false);
    }
  }

  return (
    <div
      style={{
        background: "white",
        border: "1px solid oklch(0.90 0.005 40)",
        borderRadius: "10px",
        padding: "clamp(20px, 6vw, 32px)",
        width: "100%",
        maxWidth: "360px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div className="font-display" style={{ fontSize: "18px", letterSpacing: "1px" }}>
        {orgName} <span style={{ color: "var(--color-gold)" }}>ADMIN</span>
      </div>

      <button
        type="button"
        onClick={onGoogleSignIn}
        disabled={pending}
        style={{
          background: "white",
          color: "oklch(0.20 0.01 40)",
          border: "1px solid oklch(0.75 0.005 40)",
          fontWeight: 600,
          fontSize: "14px",
          minHeight: "44px",
          padding: "12px",
          borderRadius: "6px",
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        Continuar con Google
      </button>

      {error && <div style={{ color: "oklch(0.52 0.21 26)", fontSize: "13px", fontWeight: 600 }}>{error}</div>}
    </div>
  );
}
