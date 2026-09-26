"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resetRequestErrorMessage } from "@/lib/auth/auth-errors";
import { validateEmail } from "@/lib/auth/validation";
import { PASSWORD_RESET_PATH } from "@/lib/onboarding/routing";
import AuthShell from "./AuthShell";
import FormAlert from "./FormAlert";
import TextField from "./TextField";
import { LINK, PRIMARY_BUTTON } from "./styles";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    const invalid = validateEmail(email);
    setFieldError(invalid);
    if (invalid) return;
    setPending(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // The callback exchanges the recovery code and, because `next` is the
      // exact allowlisted reset path, lands the user on the reset screen.
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(PASSWORD_RESET_PATH)}`,
    });

    // Only rate limiting is surfaced; any other outcome looks like success so
    // the screen never reveals whether the address has an account.
    const rateLimited = resetRequestErrorMessage(resetError);
    if (rateLimited) {
      setError(rateLimited);
      setPending(false);
      return;
    }
    setSent(true);
    setPending(false);
  }

  if (sent) {
    return (
      <AuthShell title="Revisa tu correo">
        <div className="space-y-5 text-center">
          <p className="text-sm leading-relaxed text-gray" role="status">
            Si <strong className="break-all font-semibold text-cream">{email.trim()}</strong> tiene una cuenta, te enviamos un enlace para
            crear una contraseña nueva. Ábrelo en este mismo navegador.
          </p>
          <p className="text-xs leading-relaxed text-gray-dim">El enlace vence pronto. ¿No llega? Revisa spam o solicítalo de nuevo.</p>
          <Link href="/admin/login" className={`${LINK} inline-block text-sm`}>
            Volver a iniciar sesión
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Recupera tu contraseña"
      subtitle="Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField
          id="forgot-email"
          label="Correo electrónico"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="tu@correo.com"
          value={email}
          onChange={setEmail}
          error={fieldError}
        />

        <FormAlert message={error} />

        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? "Enviando..." : "Enviar enlace"}
        </button>

        <p className="text-center text-sm">
          <Link href="/admin/login" className={LINK}>
            Volver a iniciar sesión
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
