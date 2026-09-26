"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/auth/auth-errors";
import { shouldRevealPassword, validateSignInInput, type AuthField } from "@/lib/auth/validation";
import AuthShell from "@/components/auth/AuthShell";
import FormAlert from "@/components/auth/FormAlert";
import GoogleButton from "@/components/auth/GoogleButton";
import OrDivider from "@/components/auth/OrDivider";
import PasswordField from "@/components/auth/PasswordField";
import TextField from "@/components/auth/TextField";
import { LINK, PRIMARY_BUTTON } from "@/components/auth/styles";

interface LoginFormProps {
  /** Prefills the email (also makes the password field visible when valid). */
  initialEmail?: string;
  /** Fixed message forwarded by /auth/callback or the admin guard (allowlisted upstream). */
  initialError?: string | null;
}

export default function LoginForm({ initialEmail = "", initialError = null }: LoginFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  // Sticky: once the password field appears it stays, so editing the email
  // afterwards does not make it flicker away.
  const [revealed, setRevealed] = useState(() => shouldRevealPassword(initialEmail));
  const [fieldError, setFieldError] = useState<{ field: AuthField; message: string } | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);

  function onEmailChange(value: string) {
    setEmail(value);
    if (!revealed && shouldRevealPassword(value)) setRevealed(true);
    if (fieldError?.field === "email") setFieldError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    const invalid = validateSignInInput({ email, password });
    if (invalid) {
      setFieldError(invalid);
      // An empty password with a valid email means the field is showing; an
      // invalid email never reaches here with the field required.
      return;
    }
    setFieldError(null);
    setPending(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (signInError) {
      setError(mapAuthError(signInError, "sign-in"));
      setPending(false);
      return;
    }

    // Full navigation so the fresh session cookie is sent; /admin decides
    // (tenant admin, other tenant, or /onboarding for users with no org).
    window.location.assign("/admin");
  }

  return (
    <AuthShell
      title="Inicia sesión en Bendita Rifa"
      subtitle={
        <>
          ¿No tienes cuenta?{" "}
          <Link href="/auth/registro" className={LINK}>
            Regístrate
          </Link>
          .
        </>
      }
      legal
    >
      <div className="space-y-5">
        <GoogleButton onStart={() => setError(null)} onError={setError} disabled={pending} />
        <OrDivider />

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <TextField
            id="login-email"
            label="Correo electrónico"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={onEmailChange}
            error={fieldError?.field === "email" ? fieldError.message : null}
          />

          {revealed ? (
            <div className="auth-reveal">
              <PasswordField
                id="login-password"
                label="Contraseña"
                autoComplete="current-password"
                value={password}
                onChange={(value) => {
                  setPassword(value);
                  if (fieldError?.field === "password") setFieldError(null);
                }}
                error={fieldError?.field === "password" ? fieldError.message : null}
                labelAction={
                  <Link href="/auth/olvide" className={`${LINK} text-xs`}>
                    ¿Olvidaste tu contraseña?
                  </Link>
                }
              />
            </div>
          ) : null}

          <FormAlert message={error} />

          <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
            {pending ? "Iniciando sesión..." : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
