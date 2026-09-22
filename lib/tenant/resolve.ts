import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSubdomain } from "./subdomain";
// NOT a static top-level import on purpose -- lib/supabase/admin.ts imports
// the "server-only" marker package, which throws unconditionally as soon as
// its module is evaluated outside a bundler that sets the "react-server"
// resolve condition (Next.js's server webpack config does; plain Node/Vitest
// doesn't). A static import here would make importing ANYTHING from this
// file -- including fetchOrganizationBySubdomain(), which tests use directly
// against a real local Postgres instance -- crash under Vitest. Deferring to
// a dynamic import inside resolveOrganizationBySubdomain() means that
// module only gets evaluated when this function actually runs, matching
// this project's existing convention of never importing lib/supabase/admin.ts
// from a test file.

export interface ResolvedOrganization {
  id: string;
  subdomain: string;
  nombre: string;
  logoUrl: string | null;
  colorPrimario: string | null;
  isPlatformOwner: boolean;
  subscriptionStatus: "trialing" | "active" | "past_due" | "canceled";
  trialEndsAt: string | null;
}

interface OrganizationRow {
  id: string;
  subdomain: string;
  nombre: string;
  logo_url: string | null;
  color_primario: string | null;
  is_platform_owner: boolean;
  subscription_status: "trialing" | "active" | "past_due" | "canceled";
  trial_ends_at: string | null;
}

function toResolvedOrganization(row: OrganizationRow): ResolvedOrganization {
  return {
    id: row.id,
    subdomain: row.subdomain,
    nombre: row.nombre,
    logoUrl: row.logo_url,
    colorPrimario: row.color_primario,
    isPlatformOwner: row.is_platform_owner,
    subscriptionStatus: row.subscription_status,
    trialEndsAt: row.trial_ends_at,
  };
}

/**
 * Looks up an organization by subdomain using the given Supabase client.
 * Exported separately from resolveOrganizationBySubdomain() (below) so the
 * query logic can be exercised directly against a real Postgres instance in
 * tests, without going through React's cache() or the service-role client
 * construction in lib/supabase/admin.ts (which reads production env var
 * names, not the TEST_SUPABASE_* ones this project's integration tests use).
 */
export async function fetchOrganizationBySubdomain(
  supabase: SupabaseClient,
  subdomain: string
): Promise<ResolvedOrganization | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, subdomain, nombre, logo_url, color_primario, is_platform_owner, subscription_status, trial_ends_at")
    .eq("subdomain", subdomain)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toResolvedOrganization(data as OrganizationRow) : null;
}

/**
 * Request-scoped, memoized tenant lookup (design D6) -- Server Components
 * and Server Actions invoked within the same request share a single query
 * for the same subdomain, via React's cache(). Uses the service-role client
 * (bypasses RLS by design -- see 0006_organizations.sql's RLS comment:
 * reads go through service-role until a later phase adds an
 * authenticated-read policy for a concrete client-side need). Never reads a
 * client-supplied org id -- the subdomain string is the only input, and it
 * comes from the Host header resolution in lib/tenant/subdomain.ts.
 */
export const resolveOrganizationBySubdomain = cache(
  async (subdomain: string): Promise<ResolvedOrganization | null> => {
    const { createAdminClient } = await import("../supabase/admin");
    return fetchOrganizationBySubdomain(createAdminClient(), subdomain);
  }
);

/**
 * Resolves a raw `Host` header straight to an organization, handling the
 * apex-domain case (design D6: "the bare apex domain and www.<apex> both
 * resolve to the apex tenant") -- which has no literal subdomain string to
 * look up by. The apex tenant is whichever organization has
 * is_platform_owner = true (D4's unique partial index guarantees exactly
 * one), not a hardcoded subdomain value.
 *
 * A "reserved" classification (parseSubdomain) never resolves to a tenant --
 * matches the spec's tenant-resolution domain: reserved subdomains are
 * blocked at organization-creation time, so no live org can ever occupy one.
 */
export async function fetchOrganizationByHost(
  supabase: SupabaseClient,
  hostHeader: string
): Promise<ResolvedOrganization | null> {
  const parsed = parseSubdomain(hostHeader);

  if (parsed.kind === "reserved") {
    return null;
  }

  if (parsed.kind === "apex") {
    const { data, error } = await supabase
      .from("organizations")
      .select("id, subdomain, nombre, logo_url, color_primario, is_platform_owner, subscription_status, trial_ends_at")
      .eq("is_platform_owner", true)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? toResolvedOrganization(data as OrganizationRow) : null;
  }

  return fetchOrganizationBySubdomain(supabase, parsed.subdomain);
}

/** Request-scoped, memoized version of fetchOrganizationByHost() -- see resolveOrganizationBySubdomain() above for why this is a dynamic import + cache(). */
export const resolveOrganizationByHost = cache(async (hostHeader: string): Promise<ResolvedOrganization | null> => {
  const { createAdminClient } = await import("../supabase/admin");
  return fetchOrganizationByHost(createAdminClient(), hostHeader);
});
