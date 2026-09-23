import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import { createClient } from "@/lib/supabase/server";
import { resolvePostAuthDestination } from "@/lib/onboarding/destination";
import { DEFAULT_APEX_DOMAIN } from "@/lib/tenant/subdomain";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Onboarding entry (spec: "First-time user with no organization is routed to
 * creation"). Requires a signed-in user; anyone who already belongs to an
 * organization is sent to their own admin instead of the wizard. The RPC
 * enforces the same rule server-side (one organization per caller), so this
 * redirect is UX, not the boundary.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const headerList = await headers();
  const host = headerList.get("host") ?? "";
  const destination = await resolvePostAuthDestination(supabase, { host, next: "/admin" });

  if (destination !== "/onboarding") {
    redirect(destination);
  }

  return (
    <div
      className="font-body"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "oklch(0.97 0.003 40)",
        color: "oklch(0.20 0.01 40)",
        padding: "clamp(16px, 6vw, 24px)",
      }}
    >
      <OnboardingWizard apexDomain={DEFAULT_APEX_DOMAIN} />
    </div>
  );
}
