import type { SupabaseClient } from "@supabase/supabase-js";

// Shared test-data builders for Phase 2 (tenant-scoped RPCs + authorization)
// integration tests. All writes go through the service-role client (bypasses
// RLS by design, matching every other test file in tests/), so these are
// pure setup helpers, not themselves exercising the RPCs/policies under test.

let seq = 0;
function unique(tag: string): string {
  return `${tag}-${Date.now()}-${seq++}`;
}

export interface TestOrg {
  id: string;
  subdomain: string;
}

export async function createTestOrg(
  admin: SupabaseClient,
  tag: string,
  overrides: Partial<{
    subscriptionStatus: "trialing" | "active" | "past_due" | "canceled";
    trialEndsAt: string | null;
    isPlatformOwner: boolean;
  }> = {}
): Promise<TestOrg> {
  const subdomain = unique(tag).toLowerCase();
  const { data, error } = await admin
    .from("organizations")
    .insert({
      subdomain,
      nombre: `Test Org ${tag}`,
      subscription_status: overrides.subscriptionStatus ?? "active",
      trial_ends_at: overrides.trialEndsAt ?? null,
      is_platform_owner: overrides.isPlatformOwner ?? false,
    })
    .select("id, subdomain")
    .single();

  if (error) throw error;
  return data as TestOrg;
}

export interface TestRaffle {
  id: string;
  organizationId: string;
  maxNumero: number;
}

export async function createTestRaffle(
  admin: SupabaseClient,
  organizationId: string,
  tag: string,
  opts: { maxNumero?: number; estado?: "borrador" | "activa" | "cerrada" | "archivada" } = {}
): Promise<TestRaffle> {
  const maxNumero = opts.maxNumero ?? 49;
  const { data, error } = await admin
    .from("raffles")
    .insert({
      organization_id: organizationId,
      nombre: `Test Raffle ${tag}`,
      estado: opts.estado ?? "activa",
      max_numero: maxNumero,
      precio_por_numero: 200,
      paquetes: [],
      numeros_bendecidos: [],
      sorteo_fecha: "15 OCT 2026",
      nequi_numero: "3000000000",
      nequi_nombre: "Test",
    })
    .select("id, organization_id, max_numero")
    .single();

  if (error) throw error;
  const row = data as { id: string; organization_id: string; max_numero: number };
  return { id: row.id, organizationId: row.organization_id, maxNumero: row.max_numero };
}

/** Seeds numeros 0..maxNumero for a raffle, all disponible. */
export async function seedNumeros(admin: SupabaseClient, raffle: TestRaffle): Promise<void> {
  const rows = Array.from({ length: raffle.maxNumero + 1 }, (_, n) => ({
    raffle_id: raffle.id,
    organization_id: raffle.organizationId,
    numero: n,
    estado: "disponible",
    es_bendecido: false,
  }));
  const { error } = await admin.from("numeros").insert(rows);
  if (error) throw error;
}

/** Deletes everything under an org (numeros/reservas/raffles/members/org itself), in FK-safe order. */
export async function cleanupOrg(admin: SupabaseClient, organizationId: string): Promise<void> {
  await admin.from("numeros").delete().eq("organization_id", organizationId);
  await admin.from("reservas").delete().eq("organization_id", organizationId);
  await admin.from("raffles").delete().eq("organization_id", organizationId);
  await admin.from("organization_members").delete().eq("organization_id", organizationId);
  await admin.from("organizations").delete().eq("id", organizationId);
}
