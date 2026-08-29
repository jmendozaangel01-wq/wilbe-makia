"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
        padding: "32px",
        width: "100%",
        maxWidth: "360px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div className="font-display" style={{ fontSize: "18px", letterSpacing: "1px" }}>
        WILBER MAKIA <span style={{ color: "oklch(0.70 0.14 80)" }}>ADMIN</span>
      </div>

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
