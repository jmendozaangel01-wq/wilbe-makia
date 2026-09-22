/**
 * Strict allowlist validator for a stored `organizations.logo_url` value
 * (design D7), matching lib/tenant/color.ts's role for `color_primario`:
 * the sole enforcement point any future write path MUST call before
 * persisting a logo URL, and the guard applied at render time
 * (components/Hero.tsx, via app/page.tsx) before the value ever reaches a
 * raw `<img src>` attribute.
 *
 * There is currently no admin UI or RPC parameter for writing logo_url
 * (same as color_primario -- crear_organizacion() takes only
 * p_nombre/p_subdomain, see supabase/migrations/0010_tenant_rpcs.sql), so
 * this module is, for now, the sole enforcement point (render-time). Any
 * future branding-settings write path MUST call this SAME function before
 * persisting a logo_url value, to avoid two copies of the allowlist that
 * could drift.
 *
 * Only `http:`/`https:` schemes are allowed -- this blocks `javascript:`,
 * `data:`, and other non-network schemes from ever reaching an `<img src>`,
 * and rejects malformed strings outright (URL parsing throws on those,
 * which we treat as invalid rather than letting the exception escape).
 */

export function isValidLogoUrl(value: string): boolean {
  if (typeof value !== "string") {
    return false;
  }
  // Cap length before parsing -- there is no reason a real logo URL should
  // ever approach this length, so reject early rather than parse an
  // attacker-controlled megabyte string.
  if (value.length === 0 || value.length > 2048) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  return parsed.protocol === "http:" || parsed.protocol === "https:";
}
