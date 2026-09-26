import { parseSubdomain } from "./subdomain";

export type HomeView = "marketing" | "tenant";

/**
 * Decides what the root route renders for a given `Host` header. The apex
 * domain (and www / localhost / unknown hosts such as Vercel previews, per
 * parseSubdomain) shows the platform's marketing landing; every tenant
 * subdomain keeps rendering only its own raffle. A missing Host keeps the
 * legacy tenant page (default branding) so nothing changes for that edge.
 */
export function selectHomeView(hostHeader: string | null | undefined): HomeView {
  if (!hostHeader) {
    return "tenant";
  }
  return parseSubdomain(hostHeader).kind === "apex" ? "marketing" : "tenant";
}
