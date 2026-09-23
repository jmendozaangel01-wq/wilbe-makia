/**
 * Allowlist of error codes accepted by /admin/login?error=<code>. The login
 * page renders only the fixed message mapped to a known code -- never the raw
 * query value -- so the URL can't be used to display attacker-chosen text.
 * Pure module (no server-only imports) so middleware can use it too.
 */
export const LOGIN_ERROR_MESSAGES = {
  no_access: "Tu cuenta no tiene acceso a este panel de administración.",
  lookup_failed: "No pudimos verificar tu acceso. Intenta de nuevo.",
  oauth_missing_code: "No recibimos el código de autorización de Google.",
  oauth_failed: "No pudimos iniciar tu sesión. Intenta de nuevo.",
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERROR_MESSAGES;

export function isLoginErrorCode(value: string | null | undefined): value is LoginErrorCode {
  return typeof value === "string" && Object.hasOwn(LOGIN_ERROR_MESSAGES, value);
}

export function getLoginErrorMessage(value: string | null | undefined): string | null {
  return isLoginErrorCode(value) ? LOGIN_ERROR_MESSAGES[value] : null;
}

/** Terminal login destination: middleware never bounces a signed-in user away from it. */
export function loginErrorPath(code: LoginErrorCode): string {
  return `/admin/login?error=${code}`;
}
