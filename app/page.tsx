import type { Metadata } from "next";
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
import { selectHomeView } from "@/lib/tenant/home-view";
import MarketingHeader from "@/components/landing/MarketingHeader";
import LandingHero from "@/components/landing/LandingHero";
import HowItWorks from "@/components/landing/HowItWorks";
import Features from "@/components/landing/Features";
import DemoIntro from "@/components/landing/DemoIntro";
import MarketingFooter from "@/components/landing/MarketingFooter";

const MARKETING_TITLE = "Bendita Rifa — Crea y administra tu rifa online";
const MARKETING_DESCRIPTION =
  "Crea tu rifa en minutos con tu propio enlace, recibe pagos por Nequi y confirma los comprobantes desde un panel. Prueba gratis 14 días.";

/**
 * Apex-only SEO metadata. Tenant hosts return {} so they keep inheriting the
 * root layout's metadata exactly as before.
 */
export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host");
  if (selectHomeView(host) !== "marketing") {
    return {};
  }
  return {
    metadataBase: new URL("https://benditarifa.com"),
    title: MARKETING_TITLE,
    description: MARKETING_DESCRIPTION,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: "/",
      siteName: "Bendita Rifa",
      locale: "es_CO",
      title: MARKETING_TITLE,
      description: MARKETING_DESCRIPTION,
    },
    twitter: { card: "summary", title: MARKETING_TITLE, description: MARKETING_DESCRIPTION },
  };
}

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

  if (selectHomeView(host) === "marketing") {
    // Apex: marketing sections around the SAME raffle components a tenant
    // sees, fed by the same tenant-zero resolution above, so the demo's
    // reservations are real.
    return (
      <div className="mk font-body bg-charcoal text-cream min-h-screen overflow-x-hidden flex flex-col flex-1">
        <MarketingHeader />
        <main>
          <LandingHero />
          <HowItWorks />
          <Features />
          <DemoIntro />
          <div className="bg-charcoal">
            <Hero orgName={orgName} logoUrl={logoUrl} headingAs="h2" />
            <BlessedNumbers initialTaken={initialTaken} orgId={org?.id ?? null} />
            <RifaFlow />
          </div>
        </main>
        <MarketingFooter />
      </div>
    );
  }

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
