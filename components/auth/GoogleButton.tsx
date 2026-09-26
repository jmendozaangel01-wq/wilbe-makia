"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GENERIC_AUTH_ERROR } from "@/lib/auth/auth-errors";
import GoogleLogo from "./GoogleLogo";
import { SECONDARY_BUTTON } from "./styles";

interface GoogleButtonProps {
  /** Reports a failure to start the flow; the message is always a fixed string. */
  onError: (message: string) => void;
  /** Called when the flow starts, so the parent can clear stale errors. */
  onStart?: () => void;
  disabled?: boolean;
}

export default function GoogleButton({ onError, onStart, disabled = false }: GoogleButtonProps) {
  const [pending, setPending] = useState(false);

  async function onGoogleSignIn() {
    setPending(true);
    onStart?.();

    // PKCE: the code verifier cookie is set on THIS host, so the callback
    // must return to the same origin -- hence window.location.origin instead
    // of a fixed URL. Each tenant host (or a wildcard) must be in Supabase's
    // redirect allow-list.
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      onError(GENERIC_AUTH_ERROR);
      setPending(false);
    }
  }

  return (
    <button type="button" onClick={onGoogleSignIn} disabled={pending || disabled} className={SECONDARY_BUTTON}>
      <GoogleLogo />
      Continuar con Google
    </button>
  );
}
