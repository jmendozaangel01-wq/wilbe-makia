"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setPending(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
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

      <div style={{ fontSize: "12px", color: "oklch(0.45 0.01 40)", textAlign: "center" }}>o con correo y contraseña</div>

      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: 600 }}>
        Correo
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            border: "1px solid oklch(0.85 0.005 40)",
            borderRadius: "6px",
            padding: "10px 12px",
            fontSize: "14px",
          }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: 600 }}>
        Contraseña
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            border: "1px solid oklch(0.85 0.005 40)",
            borderRadius: "6px",
            padding: "10px 12px",
            fontSize: "14px",
          }}
        />
      </label>

      {error && <div style={{ color: "oklch(0.52 0.21 26)", fontSize: "13px", fontWeight: 600 }}>{error}</div>}

      <button
        type="submit"
        disabled={pending}
        style={{
          background: "oklch(0.52 0.21 26)",
          color: "white",
          border: "none",
          fontWeight: 700,
          fontSize: "14px",
          padding: "12px",
          borderRadius: "6px",
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
