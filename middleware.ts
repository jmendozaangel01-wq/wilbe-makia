import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveOrganizationByHost } from "@/lib/tenant/resolve";
import { hasActiveAccess } from "@/lib/billing/access";

/**
 * Gates /admin behind a signed-in Supabase Auth session, AND (design D3)
 * redirects to /billing when the resolved tenant's trial/subscription has
 * lapsed. This subscription check is UX-only -- a convenience redirect so a
 * lapsed admin doesn't even see the dashboard shell before every action in
 * it starts failing. It is NOT the security boundary: Server Actions are
 * directly invocable POST endpoints that bypass middleware entirely if
 * called out of band, so requireAdminContext() (lib/auth/admin-context.ts)
 * re-checks hasActiveAccess() on every admin request/action regardless of
 * what happens here. Runs on every /admin request (including Server Actions
 * posted back to /admin pages) so there's no route that only relies on a
 * client-side check.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginRoute = request.nextUrl.pathname === "/admin/login";

  if (!user && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  // Subscription gate (UX-only, see header comment). Only relevant once the
  // user is past the login gate above and heading into the actual dashboard.
  if (user && !isLoginRoute) {
    const host = request.headers.get("host");
    if (host) {
      try {
        const org = await resolveOrganizationByHost(host);
        if (org && !hasActiveAccess(org)) {
          const url = request.nextUrl.clone();
          url.pathname = "/billing";
          return NextResponse.redirect(url);
        }
      } catch (err) {
        // Resolution failure here must not block the request -- this check
        // is UX-only, and requireAdminContext() is the real, fail-closed
        // boundary behind it. Log and fall through to the admin route,
        // which will itself reject the request if the tenant/subscription
        // genuinely can't be resolved.
        console.error("[middleware] subscription-gate lookup failed", err);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
