import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createTestOrg, cleanupOrg, type TestOrg } from "./helpers/fixtures";

// D5 (design, 0006_organizations.sql): `create unique index one_open_raffle
// on raffles (organization_id) where estado in ('borrador', 'activa')`.
// crear_rifa() (0010_tenant_rpcs.sql) always inserts with estado = 'activa',
// so a second crear_rifa() call for the same org must fail BY CONSTRAINT --
// design D5 is explicit that no app-level race check exists or should exist
// (a race-prone TOCTOU check would be redundant with, and weaker than, the
// database constraint). This test exercises the real crear_rifa RPC end to
// end rather than a raw INSERT against raffles, so it also doubles as smoke
// coverage for that RPC ahead of Phase 5's onboarding wizard being its first
// real caller. No new production code is introduced by this test (task
// 3.8) -- it asserts a guarantee the 0006 migration already provides.

describe("one_open_raffle partial unique index (D5)", () => {
  const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
  const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;
  let admin: SupabaseClient;
  const createdOrgIds: string[] = [];

  beforeAll(() => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    for (const orgId of createdOrgIds) {
      await cleanupOrg(admin, orgId);
    }
  });

  async function newOrg(tag: string): Promise<TestOrg> {
    const org = await createTestOrg(admin, tag);
    createdOrgIds.push(org.id);
    return org;
  }

  async function crearRifa(org: TestOrg, tag: string) {
    return admin.rpc("crear_rifa", {
      p_organization_id: org.id,
      p_nombre: `Rifa ${tag}`,
      p_max_numero: 9,
      p_precio_por_numero: 200,
      p_paquetes: [],
      p_numeros_bendecidos: [],
      p_sorteo_fecha: "15 OCT 2026",
      p_nequi_numero: "3000000000",
      p_nequi_nombre: "Test",
    });
  }

  it("blocks creating a second open raffle while one is borrador/activa", async () => {
    const org = await newOrg("lifecycle-blocked");

    const first = await crearRifa(org, "first");
    expect(first.error).toBeNull();

    const second = await crearRifa(org, "second");
    expect(second.error).not.toBeNull();
    // Postgres unique_violation -- confirms this is the constraint firing,
    // not some other unrelated failure.
    expect(second.error?.code).toBe("23505");
  });

  it("allows creating a new raffle once the previous one is cerrada, even with numbers unsold", async () => {
    const org = await newOrg("lifecycle-allowed");

    const first = await crearRifa(org, "first");
    expect(first.error).toBeNull();
    const firstRaffleId = first.data as unknown as string;

    const { error: closeError } = await admin.from("raffles").update({ estado: "cerrada" }).eq("id", firstRaffleId);
    expect(closeError).toBeNull();

    const second = await crearRifa(org, "second");
    expect(second.error).toBeNull();
    expect(second.data).not.toBe(firstRaffleId);
  });

  it("still blocks creation while the existing raffle is only borrador (not yet activa)", async () => {
    const org = await newOrg("lifecycle-borrador");

    const first = await crearRifa(org, "first");
    expect(first.error).toBeNull();
    const firstRaffleId = first.data as unknown as string;

    // crear_rifa always inserts 'activa' -- downgrade it to 'borrador' here
    // to exercise the other half of the partial index's `where estado in
    // ('borrador', 'activa')` predicate, matching the spec's "not yet
    // closed still blocks creation" scenario regardless of which of the two
    // open states the existing raffle is in.
    const { error: draftError } = await admin.from("raffles").update({ estado: "borrador" }).eq("id", firstRaffleId);
    expect(draftError).toBeNull();

    const second = await crearRifa(org, "second");
    expect(second.error).not.toBeNull();
    expect(second.error?.code).toBe("23505");
  });
});
