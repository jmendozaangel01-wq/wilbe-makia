import "server-only";
import { headers } from "next/headers";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { resolveOrganizationByHost } from "@/lib/tenant/resolve";
import { hasActiveAccess } from "@/lib/billing/access";

/**
 * Replaces requireAdmin() (app/admin/actions.ts), which only checked that a
 * Supabase session existed -- treating ANY authenticated user as admin for
 * ANY tenant, a confirmed security hole (spec's admin-authorization domain).
 * requireAdminContext() atomically: resolves the tenant from the request
 * Host header -> verifies an organization_members row for auth.uid() with
 * role in (owner, admin) -> verifies subscription access -> returns a
 * branded AdminContext. Every admin RPC call takes p_organization_id from
 * this context, so an unscoped call is awkward to write by accident (design
 * D2).
 *
 * The subscription-access decision itself (hasActiveAccess()) lives in
 * lib/billing/access.ts -- design's canonical location for it (File Changes:
 * "Provider-agnostic gate helper mirroring org_access_active"). This is the
 * REAL security boundary for the gate (middleware.ts's redirect is UX-only,
 * see design D3), since Server Actions are directly invocable POST endpoints.
 *
 * Reads organization_members/organizations/raffles through the
 * request-bound, RLS-respecting client (lib/supabase/server.ts) rather than
 * the service-role client -- this both establishes "who is this user, what
 * orgs do they belong to" through the same membership-based RLS
 * (0011_rls_rewrite.sql) the rest of the app relies on, and keeps
 * requireAdminContext() itself from being a second, parallel authorization
 * mechanism that could drift from the RLS policies over time.
 */

export type AdminRole = "owner" | "admin";

export interface AdminContext {
  userId: string;
  organizationId: string;
  raffleId: string | null;
  role: AdminRole;
}

export class AdminContextError extends Error {}

export async function requireAdminContext(): Promise<AdminContext> {
  const headerList = await headers();
  const host = headerList.get("host");
  if (!host) {
    throw new AdminContextError("No se pudo resolver la organización");
  }

  const org = await resolveOrganizationByHost(host);
  if (!org) {
    throw new AdminContextError("Organización no encontrada");
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AdminContextError("No autorizado");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    throw new AdminContextError("No se pudo verificar la membresía");
  }

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new AdminContextError("No autorizado para esta organización");
  }

  if (
    !hasActiveAccess({
      isPlatformOwner: org.isPlatformOwner,
      subscriptionStatus: org.subscriptionStatus,
      trialEndsAt: org.trialEndsAt,
    })
  ) {
    throw new AdminContextError("Suscripción inactiva");
  }

  const { data: raffle } = await supabase
    .from("raffles")
    .select("id")
    .eq("organization_id", org.id)
    .in("estado", ["borrador", "activa"])
    .maybeSingle();

  return {
    userId: user.id,
    organizationId: org.id,
    raffleId: (raffle as { id: string } | null)?.id ?? null,
    role: membership.role as AdminRole,
  };
}
