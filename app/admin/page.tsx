import { redirect } from "next/navigation";
import { getAdminDeniedRedirect } from "@/lib/onboarding/admin-denied";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminContext, AdminContextError } from "@/lib/auth/admin-context";
import { resolveOrganizationByHost, DEFAULT_ORG_NAME } from "@/lib/tenant/resolve";
import AdminDashboard, { type Reserva, type NumeroCounts } from "@/components/admin/AdminDashboard";

export default async function AdminPage() {
  let context;
  try {
    context = await requireAdminContext();
  } catch (err) {
    if (err instanceof AdminContextError) {
      redirect(await getAdminDeniedRedirect());
    }
    throw err;
  }

  // React cache()-deduped (design D6) -- app/layout.tsx already resolves
  // the same tenant by Host within this same request, so this is a
  // memoized read, not a second round trip to the DB.
  const headerList = await headers();
  const host = headerList.get("host");

  let org = null;
  if (host) {
    try {
      org = await resolveOrganizationByHost(host);
    } catch (err) {
      // Resolution failure here must not block the request -- fall back to
      // the generic default name, matching middleware.ts's fail-soft pattern
      // for this same lookup. requireAdminContext() above already re-resolved
      // the tenant and is the real fail-closed boundary; this second lookup
      // is only for display name, so a failure here is cosmetic.
      console.error("[admin] tenant resolution failed", err);
    }
  }
  const orgName = org?.nombre ?? DEFAULT_ORG_NAME;

  const admin = createAdminClient();

  const [{ data: reservas, error: reservasError }, disponibles, reservados, vendidos] = await Promise.all([
    admin
      .from("reservas")
      .select("*")
      .eq("organization_id", context.organizationId)
      .order("creado_en", { ascending: false }),
    admin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("estado", "disponible"),
    admin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("estado", "reservado"),
    admin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("estado", "vendido"),
  ]);

  if (reservasError) {
    console.error("[admin] failed to load reservas", { error: reservasError.message });
  }

  const counts: NumeroCounts = {
    disponibles: disponibles.count ?? 0,
    reservados: reservados.count ?? 0,
    vendidos: vendidos.count ?? 0,
  };

  return (
    <AdminDashboard
      initialReservas={(reservas as Reserva[]) ?? []}
      initialCounts={counts}
      orgName={orgName}
      organizationId={context.organizationId}
    />
  );
}
