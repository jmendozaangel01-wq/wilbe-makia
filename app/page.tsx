import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import SiteNav from "@/components/SiteNav";
import Hero from "@/components/Hero";
import BlessedNumbers from "@/components/BlessedNumbers";
import RifaFlow from "@/components/RifaFlow";
import SiteFooter from "@/components/SiteFooter";
import { resolveOrganizationByHost, DEFAULT_ORG_NAME } from "@/lib/tenant/resolve";
import { isValidLogoUrl } from "@/lib/tenant/logo";
import { formatCOP, formatNumero, type Paquete } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectHomeView } from "@/lib/tenant/home-view";
import type { TenantRaffleForFlow } from "@/components/RifaFlow";
import MarketingHeader from "@/components/landing/MarketingHeader";
import LandingHero from "@/components/landing/LandingHero";
import HowItWorks from "@/components/landing/HowItWorks";
import Features from "@/components/landing/Features";
import DemoIntro from "@/components/landing/DemoIntro";
import DemoHero from "@/components/landing/DemoHero";
import DemoBlessedNumbers from "@/components/landing/DemoBlessedNumbers";
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

interface BlessedNumbersData {
  /** Every numero_display this tenant marked es_bendecido -- replaces the old
   * hardcoded BLESSED_NUMBERS constant, which showed the same fixed 15
   * numbers to every tenant's buyers regardless of what they configured. */
  blessedNumbers: string[];
  /** The subset already "vendido" at render time (design D8). */
  initialTaken: string[];
}

/**
 * Server-side data for BlessedNumbers.tsx -- replaces that component's own
 * client-side anon PostgREST read. Scoped to the already Host-resolved
 * tenant, so there's no client-controlled filter to spoof. Fail-soft on
 * error: an empty result degrades to "no blessed numbers shown yet" until
 * the next successful load, matching this file's existing fail-soft pattern
 * for tenant resolution.
 */
async function loadBlessedNumbersData(organizationId: string): Promise<BlessedNumbersData> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("numeros")
      .select("numero, estado")
      .eq("organization_id", organizationId)
      .eq("es_bendecido", true);

    if (error) {
      console.error("[page] failed to load blessed-numbers data", error.message);
      return { blessedNumbers: [], initialTaken: [] };
    }

    const rows = (data as NumeroEstadoRow[] | null) ?? [];
    return {
      blessedNumbers: rows.map((row) => formatNumero(row.numero)),
      initialTaken: rows.filter((row) => row.estado === "vendido").map((row) => formatNumero(row.numero)),
    };
  } catch (err) {
    console.error("[page] blessed-numbers data fetch failed", err);
    return { blessedNumbers: [], initialTaken: [] };
  }
}

interface RafflePaqueteRow {
  tipo: string;
  qty: number;
  price: number;
}

interface ActiveRaffleRow {
  precio_por_numero: number;
  paquetes: RafflePaqueteRow[] | null;
  nequi_numero: string;
  nequi_nombre: string;
  qr_url: string | null;
  sorteo_fecha: string;
}

/** Adds the display-only fields PackageCard needs (priceLabel, popular) that
 * raffles.paquetes doesn't store -- the middle tier is marked popular as a
 * neutral, deterministic choice since which tier to highlight was never part
 * of any tenant's own configuration. */
function toDisplayPaquetes(raw: RafflePaqueteRow[]): Paquete[] {
  return raw.map((p, i) => ({
    tipo: p.tipo,
    qty: p.qty,
    price: p.price,
    priceLabel: formatCOP(p.price),
    popular: raw.length >= 3 && i === Math.floor(raw.length / 2),
  }));
}

/**
 * This tenant's active raffle, shaped for the real (non-demo) purchase flow
 * (components/RifaFlow.tsx / ReservationForm.tsx) -- replaces the hardcoded
 * lib/constants.ts values (PRICE_PER_NUMBER, PAQUETES, NEQUI_NUMERO,
 * NEQUI_NOMBRE, SORTEO_FECHA) those components used to import directly,
 * regardless of which tenant was actually being viewed.
 */
async function loadActiveRaffleForBuyer(
  organizationId: string
): Promise<(TenantRaffleForFlow & { sorteoFecha: string }) | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("raffles")
      .select("precio_por_numero, paquetes, nequi_numero, nequi_nombre, qr_url, sorteo_fecha")
      .eq("organization_id", organizationId)
      .eq("estado", "activa")
      .maybeSingle();

    if (error) {
      console.error("[page] failed to load active raffle for buyer flow", error.message);
      return null;
    }
    if (!data) return null;

    const row = data as ActiveRaffleRow;
    return {
      paquetes: toDisplayPaquetes(row.paquetes ?? []),
      pricePerNumber: row.precio_por_numero,
      nequiNumero: row.nequi_numero,
      nequiNombre: row.nequi_nombre,
      qrUrl: row.qr_url,
      sorteoFecha: row.sorteo_fecha,
    };
  } catch (err) {
    console.error("[page] active raffle fetch failed", err);
    return null;
  }
}

export default async function Home() {
  const headerList = await headers();
  const host = headerList.get("host");

  if (selectHomeView(host) === "marketing") {
    // Apex: marketing sections around a FICTIONAL, static demo raffle. This
    // branch runs before any tenant lookup on purpose: it reads nothing from
    // Supabase, and the flow runs in `demo` mode so reservations are
    // simulated client-side and never reach submitReservation.
    return (
      <div className="mk font-body bg-charcoal text-cream min-h-screen overflow-x-hidden flex flex-col flex-1">
        <MarketingHeader />
        <main>
          <LandingHero />
          <HowItWorks />
          <Features />
          <DemoIntro />
          <div className="bg-charcoal">
            <DemoHero />
            <DemoBlessedNumbers />
            <RifaFlow demo />
          </div>
        </main>
        <MarketingFooter />
      </div>
    );
  }

  let org = null;
  let resolutionFailed = false;
  if (host) {
    try {
      org = await resolveOrganizationByHost(host);
    } catch (err) {
      // Resolution failure here must not block the request -- fall back to
      // the generic default name/no branding, matching middleware.ts's
      // fail-soft pattern for this same lookup.
      resolutionFailed = true;
      console.error("[page] tenant resolution failed", err);
    }
  }

  // A lookup that succeeded but found no organization means the subdomain
  // simply doesn't exist (typo, deleted tenant) -- 404 instead of rendering a
  // raffle page for a raffle that isn't there. Only a lookup that ERRORED
  // stays fail-soft above, so a transient DB failure can't 404 real raffles.
  if (host && !resolutionFailed && !org) {
    notFound();
  }

  const orgName = org?.nombre ?? DEFAULT_ORG_NAME;
  // Invalid/malformed stored logo_url falls back to "no logo" (never throws),
  // matching isValidBrandColor()'s fail-soft handling in app/layout.tsx.
  const logoUrl = org?.logoUrl && isValidLogoUrl(org.logoUrl) ? org.logoUrl : null;

  const [{ blessedNumbers, initialTaken }, raffle] = org
    ? await Promise.all([loadBlessedNumbersData(org.id), loadActiveRaffleForBuyer(org.id)])
    : [{ blessedNumbers: [], initialTaken: [] }, null];

  return (
    <div className="font-body bg-charcoal text-cream min-h-screen overflow-x-hidden flex flex-col flex-1">
      <SiteNav />
      <Hero orgName={orgName} logoUrl={logoUrl} pricePerNumber={raffle?.pricePerNumber} sorteoFecha={raffle?.sorteoFecha} />
      <BlessedNumbers blessedNumbers={blessedNumbers} initialTaken={initialTaken} orgId={org?.id ?? null} />
      <RifaFlow raffle={raffle} />
      <SiteFooter orgName={orgName} />
    </div>
  );
}
