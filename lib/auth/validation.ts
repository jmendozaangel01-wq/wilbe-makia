/**
 * Client-side validation for the email/password screens. Pure module (no
 * React, no Supabase) so it is unit-testable and the rules live in one place.
 * The length window mirrors what Supabase enforces server-side (set the
 * project's minimum password length to 8 in the dashboard); Supabase remains
 * the source of truth -- this only gives instant feedback.
 */
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt (used by Supabase Auth) ignores everything past 72 bytes.
export const PASSWORD_MAX_LENGTH = 72;
const EMAIL_MAX_LENGTH = 254;

// Deliberately loose: one "@", no whitespace, a dotted domain with a 2+ char TLD.
// Real validation is the confirmation email itself.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

export type AuthField = "email" | "password" | "confirm";
export interface FieldError {
  field: AuthField;
  message: string;
}

export function looksLikeEmail(value: string): boolean {
  const email = value.trim();
  return email.length > 0 && email.length <= EMAIL_MAX_LENGTH && EMAIL_SHAPE.test(email);
}

/** The sign-in password field stays hidden until the email looks valid. */
export function shouldRevealPassword(email: string): boolean {
  return looksLikeEmail(email);
}

export function validateEmail(email: string): string | null {
  return looksLikeEmail(email) ? null : "Ingresa un correo válido.";
}

export function validateNewPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `La contraseña no puede superar los ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  return null;
}

export function validateSignInInput({ email, password }: { email: string; password: string }): FieldError | null {
  const emailError = validateEmail(email);
  if (emailError) return { field: "email", message: emailError };
  // No length rule here: existing accounts may predate the current policy.
  if (password.length === 0) return { field: "password", message: "Ingresa tu contraseña." };
  return null;
}

export function validateSignUpInput({
  email,
  password,
  confirm,
}: {
  email: string;
  password: string;
  confirm: string;
}): FieldError | null {
  const emailError = validateEmail(email);
  if (emailError) return { field: "email", message: emailError };
  const passwordError = validateNewPassword(password);
  if (passwordError) return { field: "password", message: passwordError };
  if (password !== confirm) return { field: "confirm", message: "Las contraseñas no coinciden." };
  return null;
}
