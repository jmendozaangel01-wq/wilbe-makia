import { headers } from "next/headers";
import SiteNav from "@/components/SiteNav";
import Hero from "@/components/Hero";
import BlessedNumbers from "@/components/BlessedNumbers";
import RifaFlow from "@/components/RifaFlow";
import SiteFooter from "@/components/SiteFooter";
import { resolveOrganizationByHost, DEFAULT_ORG_NAME } from "@/lib/tenant/resolve";

export default async function Home() {
  const headerList = await headers();
  const host = headerList.get("host");
  const org = host ? await resolveOrganizationByHost(host) : null;

  const orgName = org?.nombre ?? DEFAULT_ORG_NAME;
  const logoUrl = org?.logoUrl ?? null;

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
