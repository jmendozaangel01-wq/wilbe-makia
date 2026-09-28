import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { resolvePostAuthDestination } from "../lib/onboarding/destination";

// Onboarding creates a raffle, so it must only be offered on the platform's
// own host. A signed-in account with no membership that lands on a tenant's
// /admin must get the terminal no-access page, not the raffle-creation wizard.
// Uses a fake client (no database) so it runs without a local Supabase.

function clientWithMemberships(rows: unknown[]): Pick<SupabaseClient, "from"> {
  return {
    from: () => ({ select: async () => ({ data: rows, error: null }) }),
  } as unknown as Pick<SupabaseClient, "from">;
}

const NO_ACCESS = "/admin/login?error=no_access";

describe("resolvePostAuthDestination with zero memberships", () => {
  it.each(["benditarifa.com", "www.benditarifa.com", "localhost:3000", "my-app-git-branch.vercel.app"])(
    "offers /onboarding on the platform host %s",
    async (host) => {
      expect(await resolvePostAuthDestination(clientWithMemberships([]), { host, next: "/admin" })).toBe("/onboarding");
    }
  );

  it.each(["wilbermakia.benditarifa.com", "mrsteven.benditarifa.com", "acme.localhost:3000"])(
    "does not offer onboarding on the tenant host %s",
    async (host) => {
      expect(await resolvePostAuthDestination(clientWithMemberships([]), { host, next: "/admin" })).toBe(NO_ACCESS);
    }
  );

  it.each(["admin.benditarifa.com", "app.benditarifa.com"])("does not offer onboarding on the reserved host %s", async (host) => {
    expect(await resolvePostAuthDestination(clientWithMemberships([]), { host, next: "/admin" })).toBe(NO_ACCESS);
  });
});
