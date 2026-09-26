"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/auth/auth-errors";
import { PASSWORD_MIN_LENGTH, validateSignUpInput, type AuthField } from "@/lib/auth/validation";
import AuthShell from "./AuthShell";
import FormAlert from "./FormAlert";
import GoogleButton from "./GoogleButton";
import OrDivider from "./OrDivider";
import PasswordField from "./PasswordField";
import TextField from "./TextField";
import { LINK, PRIMARY_BUTTON } from "./styles";

export default function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<{ field: AuthField; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    const invalid = validateSignUpInput({ email, password, confirm });
    if (invalid) {
      setFieldError(invalid);
      return;
    }
    setFieldError(null);
    setPending(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (signUpError) {
      setError(mapAuthError(signUpError, "sign-up"));
      setPending(false);
      return;
    }

    // With email confirmation on, Supabase returns no session -- and returns
    // the same shape for an already-registered address -- so this state must
    // read identically in both cases.
    if (data.session) {
      window.location.assign("/onboarding");
      return;
    }
    setSentTo(email.trim());
    setPending(false);
  }

  if (sentTo) {
    return (
      <AuthShell title="Revisa tu correo">
        <div className="space-y-5 text-center">
          <p className="text-sm leading-relaxed text-gray" role="status">
            Si <strong className="break-all font-semibold text-cream">{sentTo}</strong> puede crear una cuenta, te enviamos un enlace para confirmarla.
            Ábrelo en este mismo navegador para continuar.
          </p>
          <p className="text-xs leading-relaxed text-gray-dim">¿No llega? Revisa spam o vuelve a intentarlo en unos minutos.</p>
          <Link href="/admin/login" className={`${LINK} inline-block text-sm`}>
            Volver a iniciar sesión
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Crea tu cuenta"
      subtitle={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/admin/login" className={LINK}>
            Inicia sesión
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
            id="signup-email"
            label="Correo electrónico"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={setEmail}
            error={fieldError?.field === "email" ? fieldError.message : null}
          />
          <PasswordField
            id="signup-password"
            label="Contraseña"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
            error={fieldError?.field === "password" ? fieldError.message : null}
          />
          <PasswordField
            id="signup-confirm"
            label="Confirma tu contraseña"
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
            error={fieldError?.field === "confirm" ? fieldError.message : null}
          />

          <FormAlert message={error} />

          <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
            {pending ? "Creando cuenta..." : "Crear cuenta"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
