/**
 * Strict allowlist validator for a single CSS custom-property color value
 * (design D7). This is the ONLY thing standing between a stored
 * `organizations.color_primario` value and being interpolated, unescaped,
 * into a server-rendered `<style>` tag (app/layout.tsx) -- so it validates
 * by whole-string match (`^...$`) against a narrow allowed character set,
 * not by looking for "bad" substrings. A payload like `red</style><script>`
 * cannot match either pattern below (neither allows `<`, `>`, `;`, quotes,
 * or backslashes anywhere), so there is no way for a stored value to break
 * out of the `<style>` tag it's interpolated into, independent of any
 * escaping done at the call site.
 *
 * Two shapes are accepted, matching what this codebase's own CSS already
 * uses (app/globals.css) and what a color picker UI would realistically
 * produce:
 *   - hex: #rgb, #rgba, #rrggbb, #rrggbbaa
 *   - oklch(): oklch(L C H) or oklch(L C H / A), with L/C/H as plain
 *     numbers or percentages, optional `deg` unit on H, matching CSS's
 *     oklch() functional syntax at the level of precision this app needs
 *     (no oklch(none ...) / calc() / var() support -- those aren't
 *     necessary for a single stored brand color and would only widen the
 *     allowed character set for no benefit).
 *
 * There is currently no admin UI or RPC parameter for writing
 * color_primario (crear_organizacion() takes only p_nombre/p_subdomain --
 * see supabase/migrations/0010_tenant_rpcs.sql) -- so this module is, for
 * now, the sole enforcement point (render-time). Task 3.1's "write time"
 * requirement is satisfied by this SAME function being the one any future
 * write path (an extended crear_organizacion, or a later branding-settings
 * RPC/action) MUST call before persisting a color value -- there is
 * deliberately only one validator to keep in sync, not two copies that
 * could drift.
 */

const HEX_COLOR = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const NUMBER_OR_PERCENT = "\\d+(?:\\.\\d+)?%?";
const OKLCH_COLOR = new RegExp(
  `^oklch\\(\\s*${NUMBER_OR_PERCENT}\\s+${NUMBER_OR_PERCENT}\\s+${NUMBER_OR_PERCENT}(?:deg)?\\s*(?:/\\s*${NUMBER_OR_PERCENT}\\s*)?\\)$`
);

export function isValidBrandColor(value: string): boolean {
  if (typeof value !== "string") {
    return false;
  }
  // Cap length before running either regex -- both patterns are anchored
  // and non-backtracking-heavy (no nested quantifiers), but there is no
  // reason a real color value should ever approach this length, so reject
  // early rather than run a regex against an attacker-controlled megabyte
  // string.
  if (value.length === 0 || value.length > 64) {
    return false;
  }
  return HEX_COLOR.test(value) || OKLCH_COLOR.test(value);
}
