import { redirect } from "next/navigation";
import { getAdminDeniedRedirect } from "@/lib/onboarding/admin-denied";
import { buildTenantAdminUrl } from "@/lib/onboarding/routing";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminContext, AdminContextError } from "@/lib/auth/admin-context";
import { resolveOrganizationByHost, DEFAULT_ORG_NAME } from "@/lib/tenant/resolve";
import AdminDashboard, { type Reserva, type NumeroCounts } from "@/components/admin/AdminDashboard";
import type { RaffleConfigData } from "@/components/admin/ConfiguracionTab";

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

  const [{ data: reservas, error: reservasError }, disponibles, reservados, vendidos, raffleRow] = await Promise.all([
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
    context.raffleId
      ? admin
          .from("raffles")
          .select(
            "nombre, premio_nombre, premio_imagen_url, max_numero, precio_por_numero, sorteo_fecha, nequi_numero, nequi_nombre, numeros_bendecidos, qr_url"
          )
          .eq("id", context.raffleId)
          .eq("organization_id", context.organizationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (reservasError) {
    console.error("[admin] failed to load reservas", { error: reservasError.message });
  }
  if (raffleRow.error) {
    console.error("[admin] failed to load raffle config", { error: raffleRow.error.message });
  }

  const counts: NumeroCounts = {
    disponibles: disponibles.count ?? 0,
    reservados: reservados.count ?? 0,
    vendidos: vendidos.count ?? 0,
  };

  const raffle = raffleRow.data as {
    nombre: string;
    premio_nombre: string;
    premio_imagen_url: string | null;
    max_numero: number;
    precio_por_numero: number;
    sorteo_fecha: string;
    nequi_numero: string;
    nequi_nombre: string;
    numeros_bendecidos: number[];
    qr_url: string | null;
  } | null;

  const raffleConfig: RaffleConfigData | null = raffle
    ? {
        raffleName: raffle.nombre,
        premioNombre: raffle.premio_nombre,
        maxNumero: raffle.max_numero,
        precioPorNumero: String(raffle.precio_por_numero),
        sorteoFecha: raffle.sorteo_fecha,
        nequiNumero: raffle.nequi_numero,
        nequiNombre: raffle.nequi_nombre,
        numerosBendecidos: raffle.numeros_bendecidos.join(", "),
      }
    : null;

  return (
    <AdminDashboard
      initialReservas={(reservas as Reserva[]) ?? []}
      initialCounts={counts}
      orgName={orgName}
      organizationId={context.organizationId}
      raffleConfig={raffleConfig}
      logoUrl={org?.logoUrl ?? null}
      qrUrl={raffle?.qr_url ?? null}
      premioImagenUrl={raffle?.premio_imagen_url ?? null}
      raffleUrl={org && host ? buildTenantAdminUrl(org.subdomain, host, "/") : null}
      blessedNumbers={raffle?.numeros_bendecidos ?? []}
      pricePerNumber={raffle?.precio_por_numero ?? null}
      raffleId={context.raffleId ?? null}
    />
  );
}
