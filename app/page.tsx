import { headers } from "next/headers";
import SiteNav from "@/components/SiteNav";
import Hero from "@/components/Hero";
import BlessedNumbers from "@/components/BlessedNumbers";
import RifaFlow from "@/components/RifaFlow";
import SiteFooter from "@/components/SiteFooter";
import { resolveOrganizationByHost, DEFAULT_ORG_NAME } from "@/lib/tenant/resolve";
import { isValidLogoUrl } from "@/lib/tenant/logo";

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

  return (
    <div className="font-body bg-charcoal text-cream min-h-screen overflow-x-hidden flex flex-col flex-1">
      <SiteNav />
      <Hero orgName={orgName} logoUrl={logoUrl} />
      <BlessedNumbers />
      <RifaFlow />
      <SiteFooter orgName={orgName} />
    </div>
  );
}
