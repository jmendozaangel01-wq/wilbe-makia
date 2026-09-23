/**
 * Cookie options shared by every Supabase SSR/browser client. Auth cookies
 * are host-scoped by default; setting NEXT_PUBLIC_COOKIE_DOMAIN (for example
 * ".rifamakia.com") scopes them to the parent domain so a session created on
 * the apex (Google sign-in + onboarding) is also sent to
 * <tenant>.rifamakia.com/admin after the wizard redirects there. Leave it
 * unset for local development (host-only cookies).
 */
export function getAuthCookieOptions(): { domain?: string } {
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim();
  return domain ? { domain } : {};
}
