import { headers } from "next/headers";
import SiteNav from "@/components/SiteNav";
import Hero from "@/components/Hero";
import BlessedNumbers from "@/components/BlessedNumbers";
import RifaFlow from "@/components/RifaFlow";
import SiteFooter from "@/components/SiteFooter";
import { resolveOrganizationByHost, DEFAULT_ORG_NAME } from "@/lib/tenant/resolve";
import { isValidLogoUrl } from "@/lib/tenant/logo";
import { formatNumero } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";

interface NumeroEstadoRow {
  numero: number;
  estado: string;
}

/**
 * Server-side initial snapshot for BlessedNumbers.tsx (design D8) -- replaces
 * that component's own client-side anon PostgREST read. Scoped to the
 * already Host-resolved tenant, so there's no client-controlled filter to
 * spoof. Fail-soft on error: an empty snapshot degrades to "nothing shown as
 * taken yet" until the first Broadcast event arrives, matching this file's
 * existing fail-soft pattern for tenant resolution.
 */
async function loadBlessedNumbersSnapshot(organizationId: string): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("numeros")
      .select("numero, estado")
      .eq("organization_id", organizationId)
      .eq("es_bendecido", true);

    if (error) {
      console.error("[page] failed to load blessed-numbers snapshot", error.message);
      return [];
    }

    return (data as NumeroEstadoRow[] | null ?? [])
      .filter((row) => row.estado === "vendido")
      .map((row) => formatNumero(row.numero));
  } catch (err) {
    console.error("[page] blessed-numbers snapshot fetch failed", err);
    return [];
  }
}

export default async function Home() {
  const headerList = await headers();
  const host = headerList.get("host");

  let org = null;
  if (host) {
    try {
      org = await resolveOrganizationByHost(host);
    } catch (err) {
      // Resolution failure here must not block the request -- fall back to
      // the generic default name/no branding, matching middleware.ts's
      // fail-soft pattern for this same lookup.
      console.error("[page] tenant resolution failed", err);
    }
  }

  const orgName = org?.nombre ?? DEFAULT_ORG_NAME;
  // Invalid/malformed stored logo_url falls back to "no logo" (never throws),
  // matching isValidBrandColor()'s fail-soft handling in app/layout.tsx.
  const logoUrl = org?.logoUrl && isValidLogoUrl(org.logoUrl) ? org.logoUrl : null;

  const initialTaken = org ? await loadBlessedNumbersSnapshot(org.id) : [];

  return (
    <div className="font-body bg-charcoal text-cream min-h-screen overflow-x-hidden flex flex-col flex-1">
      <SiteNav />
      <Hero orgName={orgName} logoUrl={logoUrl} />
      <BlessedNumbers initialTaken={initialTaken} orgId={org?.id ?? null} />
      <RifaFlow />
      <SiteFooter orgName={orgName} />
    </div>
  );
}
