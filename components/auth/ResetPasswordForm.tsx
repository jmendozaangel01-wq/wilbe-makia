"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/auth/auth-errors";
import { PASSWORD_MIN_LENGTH, validateNewPassword } from "@/lib/auth/validation";
import AuthShell from "./AuthShell";
import FormAlert from "./FormAlert";
import PasswordField from "./PasswordField";
import { PRIMARY_BUTTON } from "./styles";

type Phase = "checking" | "no-session" | "form" | "done";

/**
 * Lands here from /auth/callback?next=/auth/reset with a recovery session
 * cookie already set. Without a session (expired/used link, direct visit) the
 * form is never shown.
 */
export default function ResetPasswordForm() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<{ field: "password" | "confirm"; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (active) setPhase(data.user ? "form" : "no-session");
      })
      .catch(() => {
        if (active) setPhase("no-session");
      });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    const lengthError = validateNewPassword(password);
    if (lengthError) {
      setFieldError({ field: "password", message: lengthError });
      return;
    }
    if (password !== confirm) {
      setFieldError({ field: "confirm", message: "Las contraseñas no coinciden." });
      return;
    }
    setFieldError(null);
    setPending(true);

    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) {
      setError(mapAuthError(updateError, "reset"));
      setPending(false);
      return;
    }

    setPhase("done");
    // The recovery session is a normal session: continue into the app, where
    // /admin routes by membership (tenant admin or /onboarding).
    window.setTimeout(() => window.location.assign("/admin"), 1200);
  }

  if (phase === "checking") {
    return (
      <AuthShell title="Nueva contraseña">
        <p role="status" className="text-center text-sm text-gray">
          Verificando enlace...
        </p>
      </AuthShell>
    );
  }

  if (phase === "no-session") {
    return (
      <AuthShell title="Enlace no válido">
        <div className="space-y-5 text-center">
          <p role="alert" className="text-sm leading-relaxed text-gray">
            El enlace venció o ya no es válido. Solicita uno nuevo para cambiar tu contraseña.
          </p>
          <Link href="/auth/olvide" className={`${PRIMARY_BUTTON} text-charcoal! hover:text-charcoal! hover:no-underline`}>
            Solicitar enlace nuevo
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (phase === "done") {
    return (
      <AuthShell title="Contraseña actualizada">
        <p role="status" className="text-center text-sm text-gray">
          Listo. Te llevamos a tu panel...
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Crea una contraseña nueva" subtitle="Elige una contraseña que no uses en otros sitios.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <PasswordField
          id="reset-password"
          label="Contraseña nueva"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
          error={fieldError?.field === "password" ? fieldError.message : null}
        />
        <PasswordField
          id="reset-confirm"
          label="Confirma tu contraseña"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          error={fieldError?.field === "confirm" ? fieldError.message : null}
        />

        <FormAlert message={error} />

        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? "Guardando..." : "Guardar contraseña"}
        </button>
      </form>
    </AuthShell>
  );
}
