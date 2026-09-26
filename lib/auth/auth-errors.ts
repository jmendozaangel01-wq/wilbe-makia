/**
 * Maps Supabase Auth errors to fixed Spanish messages. Only the stable
 * `code` is consulted -- the raw `message` is never shown, so server text
 * (which can echo emails or change wording) cannot reach the UI.
 *
 * Enumeration safety: for sign-up and reset requests, codes that would reveal
 * whether an address is registered (user_already_exists, user_not_found, ...)
 * are intentionally NOT mapped and collapse into the generic message.
 * (invalid_credentials at sign-in is already ambiguous by design.)
 */
export type AuthFlow = "sign-in" | "sign-up" | "reset-request" | "reset";

export const GENERIC_AUTH_ERROR = "No pudimos completar la solicitud. Intenta de nuevo.";

const RATE_LIMITED = "Demasiados intentos. Espera unos minutos e intenta de nuevo.";
const LINK_EXPIRED = "El enlace venció o ya no es válido. Solicita uno nuevo.";

const COMMON: Record<string, string> = {
  over_request_rate_limit: RATE_LIMITED,
  over_email_send_rate_limit: RATE_LIMITED,
  over_sms_send_rate_limit: RATE_LIMITED,
};

const BY_FLOW: Record<AuthFlow, Record<string, string>> = {
  "sign-in": {
    invalid_credentials: "Correo o contraseña incorrectos.",
    email_not_confirmed: "Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.",
  },
  "sign-up": {
    weak_password: "La contraseña es muy débil. Usa al menos 8 caracteres y evita contraseñas comunes.",
  },
  "reset-request": {},
  reset: {
    weak_password: "La contraseña es muy débil. Usa al menos 8 caracteres y evita contraseñas comunes.",
    same_password: "Elige una contraseña distinta a la anterior.",
    session_not_found: LINK_EXPIRED,
    reauthentication_needed: LINK_EXPIRED,
    reauthentication_not_valid: LINK_EXPIRED,
  },
};

export function mapAuthError(error: { code?: string; message?: string } | null | undefined, flow: AuthFlow): string {
  const code = error?.code;
  if (typeof code !== "string") return GENERIC_AUTH_ERROR;
  // Object.hasOwn: a code like "constructor" must not hit Object.prototype.
  if (Object.hasOwn(BY_FLOW[flow], code)) return BY_FLOW[flow][code];
  if (Object.hasOwn(COMMON, code)) return COMMON[code];
  return GENERIC_AUTH_ERROR;
}
