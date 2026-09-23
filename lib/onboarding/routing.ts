import { DEFAULT_APEX_DOMAIN } from "../tenant/subdomain";

const DEFAULT_NEXT = "/admin";

/**
 * Sanitizes the `next` redirect target carried through the OAuth round trip.
 * Only same-origin relative paths are allowed -- anything else (absolute
 * URLs, protocol-relative `//host`, backslash tricks, other schemes) falls
 * back to /admin so the callback can never be turned into an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return DEFAULT_NEXT;
  }
  return next;
}

/**
 * Builds the absolute URL of a tenant's admin area (or another path on that
 * tenant's host) from the host the request arrived on. Mirrors
 * parseSubdomain()'s host model: production hosts hang off the apex domain,
 * local dev uses <sub>.localhost[:port]. Any other host (e.g. a Vercel
 * preview deployment, where subdomains are not routable) returns a relative
 * path so the user stays on the current host.
 */
export function buildTenantAdminUrl(
  subdomain: string,
  currentHost: string,
  path: string = DEFAULT_NEXT,
  apexDomain: string = DEFAULT_APEX_DOMAIN
): string {
  const host = currentHost.trim().toLowerCase();
  const portMatch = host.match(/:(\d+)$/);
  const port = portMatch ? `:${portMatch[1]}` : "";
  const bare = host.replace(/:\d+$/, "");
  const apex = apexDomain.toLowerCase();

  if (bare === apex || bare.endsWith(`.${apex}`)) {
    return `https://${subdomain}.${apex}${path}`;
  }

  if (bare === "localhost" || bare.endsWith(".localhost")) {
    return `http://${subdomain}.localhost${port}${path}`;
  }

  return path;
}
