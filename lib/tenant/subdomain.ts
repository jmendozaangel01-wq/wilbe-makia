/**
 * Pure host-header parsing for tenant resolution (design D6). No I/O, no DB
 * lookup -- this only classifies a raw `Host` header string. Whether a
 * classified "tenant" subdomain actually maps to an existing organization is
 * decided by lib/tenant/resolve.ts, not here.
 */

// "www" is deliberately NOT in this set -- it resolves to the apex tenant
// (tenant zero), it is not merely blocked from tenant creation like the
// words below. isReservedSubdomain() below folds "www" back in for the
// organization-creation validation use case (spec: reserved subdomains MUST
// include at least www, admin, app, api).
const RESERVED_SUBDOMAINS = new Set(["admin", "app", "api", "auth", "static"]);

export const DEFAULT_APEX_DOMAIN = "benditarifa.com";

export type SubdomainResult =
  | { kind: "apex" }
  | { kind: "reserved"; subdomain: string }
  | { kind: "tenant"; subdomain: string };

function stripPort(host: string): string {
  return host.replace(/:\d+$/, "");
}

function classifyLabel(subdomain: string): SubdomainResult {
  return RESERVED_SUBDOMAINS.has(subdomain)
    ? { kind: "reserved", subdomain }
    : { kind: "tenant", subdomain };
}

/**
 * Classifies a raw `Host` header against the platform's apex domain.
 *
 * - The bare apex domain and `www.<apex>` both resolve to the apex tenant
 *   (tenant zero) -- see D6.
 * - `<subdomain>.<apex>` resolves to that subdomain, unless it's on the
 *   reserved list, in which case it's classified "reserved".
 * - `localhost`/`127.0.0.1` (with or without a port) resolve to the apex
 *   tenant for local dev with no subdomain.
 * - `<subdomain>.localhost` resolves the same way as `<subdomain>.<apex>`,
 *   so tenant subdomains can be exercised locally.
 * - Any other host that doesn't match the apex domain at all -- e.g. a
 *   Vercel preview deployment host -- falls back to the apex tenant instead
 *   of being misparsed as a tenant subdomain or rejected outright.
 */
export function parseSubdomain(hostHeader: string, apexDomain: string = DEFAULT_APEX_DOMAIN): SubdomainResult {
  const host = stripPort(hostHeader.trim().toLowerCase());
  const apex = apexDomain.trim().toLowerCase();

  if (host === apex || host === `www.${apex}`) {
    return { kind: "apex" };
  }

  if (host.endsWith(`.${apex}`)) {
    return classifyLabel(host.slice(0, -(apex.length + 1)));
  }

  if (host === "localhost" || host === "127.0.0.1") {
    return { kind: "apex" };
  }

  if (host.endsWith(".localhost")) {
    return classifyLabel(host.slice(0, -".localhost".length));
  }

  return { kind: "apex" };
}

/**
 * Whether a candidate subdomain string must be rejected at organization
 * creation time (spec: reserved list, at minimum www/admin/app/api).
 * Includes "www" even though parseSubdomain() treats it as an apex alias
 * rather than "reserved" -- the two functions answer different questions.
 */
export function isReservedSubdomain(subdomain: string): boolean {
  const normalized = subdomain.trim().toLowerCase();
  return normalized === "www" || RESERVED_SUBDOMAINS.has(normalized);
}
