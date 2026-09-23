import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loginErrorPath, type LoginErrorCode } from "@/lib/auth/login-errors";
import { resolvePostAuthDestination } from "@/lib/onboarding/destination";

/**
 * Supabase Auth OAuth (PKCE) callback. Exchanges the `code` Google/Supabase
 * appended to the redirect for a session cookie, then routes by membership:
 * no organization yet -> /onboarding, otherwise the user's tenant admin.
 * The `next` target is sanitized (safeNextPath) inside
 * resolvePostAuthDestination so the callback is never an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  const failure = (code: LoginErrorCode) => NextResponse.redirect(new URL(loginErrorPath(code), origin));

  if (!code) {
    return failure("oauth_missing_code");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return failure("oauth_failed");
  }

  const host = request.headers.get("host") ?? request.nextUrl.host;

  try {
    const destination = await resolvePostAuthDestination(supabase, { host, next: searchParams.get("next") });
    return NextResponse.redirect(new URL(destination, origin));
  } catch (err) {
    console.error("[auth/callback] destination lookup failed", err);
    return failure("oauth_failed");
  }
}
