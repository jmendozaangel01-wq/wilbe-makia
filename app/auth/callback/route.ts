import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loginErrorPath, type LoginErrorCode } from "@/lib/auth/login-errors";
import { resolvePostAuthDestination } from "@/lib/onboarding/destination";
import { isPasswordResetNext, PASSWORD_RESET_PATH } from "@/lib/onboarding/routing";

/**
 * Supabase Auth PKCE callback shared by Google OAuth, email confirmation and
 * password recovery links. Exchanges the `code` for a session cookie, then
 * routes:
 * - `next` is exactly the password-reset path -> straight to the reset screen
 *   (a recovery session must not be diverted by membership routing);
 * - otherwise by membership: no organization yet -> /onboarding (this is also
 *   where a freshly confirmed email sign-up lands), else the tenant admin.
 * Any other `next` is sanitized (safeNextPath) inside
 * resolvePostAuthDestination so the callback is never an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const isRecovery = isPasswordResetNext(next);

  const failure = (errorCode: LoginErrorCode) => NextResponse.redirect(new URL(loginErrorPath(errorCode), origin));

  if (!code) {
    // Supabase reports an expired/used email link as ?error=...&error_code=...
    // (no code). Show a fixed message; the raw description is never echoed.
    if (searchParams.has("error") || searchParams.has("error_code")) {
      return failure("link_invalid");
    }
    return failure("oauth_missing_code");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return failure(isRecovery ? "link_invalid" : "oauth_failed");
  }

  if (isRecovery) {
    return NextResponse.redirect(new URL(PASSWORD_RESET_PATH, origin));
  }

  const host = request.headers.get("host") ?? request.nextUrl.host;

  try {
    const destination = await resolvePostAuthDestination(supabase, { host, next });
    return NextResponse.redirect(new URL(destination, origin));
  } catch (err) {
    console.error("[auth/callback] destination lookup failed", err);
    return failure("oauth_failed");
  }
}
