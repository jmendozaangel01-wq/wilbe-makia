import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser, deleteTestUser } from "./helpers/auth";

// Proves crear_organizacion_con_rifa (Phase 5 onboarding): one atomic call
// creates the organization, the caller's owner membership, and the first
// raffle with its seeded numeros pool. Requires 0012_onboarding_rpc.sql
// (RED until then).

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

let admin: SupabaseClient;
const createdUserIds: string[] = [];
const createdSubdomains: string[] = [];

let seq = 0;
function sub(tag: string): string {
  const s = `${tag}-${Date.now().toString(36)}${seq++}`;
  createdSubdomains.push(s);
  return s;
}

function args(subdomain: string, overrides: Record<string, unknown> = {}) {
  return {
    p_nombre: "Onboarding Org",
    p_subdomain: subdomain,
    p_raffle_nombre: "First Raffle",
    p_max_numero: 99,
    p_precio_por_numero: 200,
    p_paquetes: [{ tipo: "paquete_10", qty: 10, price: 2000 }],
    p_numeros_bendecidos: [7, 42],
    p_sorteo_fecha: "15 OCT 2026",
    p_nequi_numero: "3000000000",
    p_nequi_nombre: "Test Owner",
    ...overrides,
  };
}

beforeAll(() => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
});

afterAll(async () => {
  for (const s of createdSubdomains) {
    const { data: org } = await admin.from("organizations").select("id").eq("subdomain", s).maybeSingle();
    if (org) {
      await admin.from("numeros").delete().eq("organization_id", org.id);
      await admin.from("raffles").delete().eq("organization_id", org.id);
      await admin.from("organization_members").delete().eq("organization_id", org.id);
      await admin.from("organizations").delete().eq("id", org.id);
    }
  }
  for (const id of createdUserIds) await deleteTestUser(id);
});

describe("crear_organizacion_con_rifa", () => {
  it("creates org + owner membership + active raffle + seeded pool in one call", async () => {
    const user = await createAuthedUser("onb-ok");
    createdUserIds.push(user.userId);
    const subdomain = sub("onb-ok");

    const { data, error } = await user.client.rpc("crear_organizacion_con_rifa", args(subdomain));
    expect(error).toBeNull();
    const row = (data as { organization_id: string; raffle_id: string }[])[0];

    const { data: org } = await admin.from("organizations").select("*").eq("id", row.organization_id).single();
    expect(org.subdomain).toBe(subdomain);
    expect(org.is_platform_owner).toBe(false);
    expect(org.subscription_status).toBe("trialing");
    const days = (new Date(org.trial_ends_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);

    const { data: member } = await admin
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", row.organization_id);
    expect(member).toEqual([{ user_id: user.userId, role: "owner" }]);

    const { data: raffle } = await admin.from("raffles").select("*").eq("id", row.raffle_id).single();
    expect(raffle.organization_id).toBe(row.organization_id);
    expect(raffle.estado).toBe("activa");
    expect(raffle.max_numero).toBe(99);

    const { count } = await admin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("raffle_id", row.raffle_id);
    expect(count).toBe(100);

    const { data: blessed } = await admin
      .from("numeros")
      .select("numero")
      .eq("raffle_id", row.raffle_id)
      .eq("es_bendecido", true)
      .order("numero");
    expect(blessed?.map((b) => b.numero)).toEqual([7, 42]);
  });

  it("rolls back the organization and membership when the raffle part fails (atomicity)", async () => {
    const user = await createAuthedUser("onb-atomic");
    createdUserIds.push(user.userId);
    const subdomain = sub("onb-atomic");

    const { error } = await user.client.rpc(
      "crear_organizacion_con_rifa",
      args(subdomain, { p_max_numero: 100_000 }) // violates raffles.max_numero <= 99999
    );
    expect(error).not.toBeNull();

    const { data: org } = await admin.from("organizations").select("id").eq("subdomain", subdomain).maybeSingle();
    expect(org).toBeNull();
    const { data: members } = await admin.from("organization_members").select("id").eq("user_id", user.userId);
    expect(members).toEqual([]);
  });

  it.each([
    ["reserved word", "admin"],
    ["www alias", "www"],
    ["uppercase-only invalid charset (dot)", "a.b"],
    ["leading hyphen", "-abc"],
    ["underscore", "my_org"],
  ])("rejects an invalid subdomain (%s)", async (_label, bad) => {
    const user = await createAuthedUser("onb-bad");
    createdUserIds.push(user.userId);
    const { error } = await user.client.rpc("crear_organizacion_con_rifa", args(bad));
    expect(error).not.toBeNull();
    const { data: members } = await admin.from("organization_members").select("id").eq("user_id", user.userId);
    expect(members).toEqual([]);
  });

  it("rejects a duplicate subdomain", async () => {
    const [a, b] = await Promise.all([createAuthedUser("onb-dup-a"), createAuthedUser("onb-dup-b")]);
    createdUserIds.push(a.userId, b.userId);
    const subdomain = sub("onb-dup");

    expect((await a.client.rpc("crear_organizacion_con_rifa", args(subdomain))).error).toBeNull();
    expect((await b.client.rpc("crear_organizacion_con_rifa", args(subdomain))).error).not.toBeNull();
  });

  it("refuses a caller who already belongs to an organization (no unbounded org creation)", async () => {
    const user = await createAuthedUser("onb-twice");
    createdUserIds.push(user.userId);

    expect((await user.client.rpc("crear_organizacion_con_rifa", args(sub("onb-twice-1")))).error).toBeNull();
    expect((await user.client.rpc("crear_organizacion_con_rifa", args(sub("onb-twice-2")))).error).not.toBeNull();
  });

  it("allows exactly one organization when the same user calls concurrently", async () => {
    const user = await createAuthedUser("onb-race");
    createdUserIds.push(user.userId);

    const results = await Promise.all(
      [1, 2, 3, 4].map((i) => user.client.rpc("crear_organizacion_con_rifa", args(sub(`onb-race-${i}`))))
    );
    expect(results.filter((r) => r.error === null)).toHaveLength(1);

    const { data: members } = await admin.from("organization_members").select("id").eq("user_id", user.userId);
    expect(members).toHaveLength(1);
  });

  it.each([
    ["empty organization name", { p_nombre: "   " }],
    ["organization name over 80 chars", { p_nombre: "x".repeat(81) }],
    ["null organization name", { p_nombre: null }],
    ["empty raffle name", { p_raffle_nombre: "" }],
    ["raffle name over 80 chars", { p_raffle_nombre: "x".repeat(81) }],
    ["zero price", { p_precio_por_numero: 0 }],
    ["negative price", { p_precio_por_numero: -5 }],
    ["price above the cap", { p_precio_por_numero: 10_000_001 }],
    ["null price", { p_precio_por_numero: null }],
    ["max_numero below the minimum pool", { p_max_numero: 5 }],
    ["max_numero above the cap", { p_max_numero: 100_000 }],
    ["null max_numero", { p_max_numero: null }],
    ["paquetes not an array", { p_paquetes: { tipo: "x" } }],
    ["null paquetes", { p_paquetes: null }],
    ["paquetes element not an object", { p_paquetes: [1] }],
    ["paquetes element missing fields", { p_paquetes: [{ tipo: "paquete_10" }] }],
    ["paquetes element with non-positive qty", { p_paquetes: [{ tipo: "p", qty: 0, price: 10 }] }],
    ["paquetes element with non-positive price", { p_paquetes: [{ tipo: "p", qty: 10, price: 0 }] }],
    ["paquetes element with non-numeric qty", { p_paquetes: [{ tipo: "p", qty: "10", price: 10 }] }],
    ["too many paquetes", { p_paquetes: Array.from({ length: 21 }, () => ({ tipo: "p", qty: 10, price: 10 })) }],
  ])("rejects direct-call abuse: %s", async (_label, overrides) => {
    const user = await createAuthedUser("onb-abuse");
    createdUserIds.push(user.userId);
    const subdomain = sub("onb-abuse");

    const { error } = await user.client.rpc("crear_organizacion_con_rifa", args(subdomain, overrides));
    expect(error).not.toBeNull();

    const { data: org } = await admin.from("organizations").select("id").eq("subdomain", subdomain).maybeSingle();
    expect(org).toBeNull();
    const { data: members } = await admin.from("organization_members").select("id").eq("user_id", user.userId);
    expect(members).toEqual([]);
  });

  it("treats NULL p_numeros_bendecidos as an empty list", async () => {
    const user = await createAuthedUser("onb-nullbless");
    createdUserIds.push(user.userId);

    const { data, error } = await user.client.rpc(
      "crear_organizacion_con_rifa",
      args(sub("onb-nullbless"), { p_numeros_bendecidos: null })
    );
    expect(error).toBeNull();
    const row = (data as { raffle_id: string }[])[0];
    const { data: blessed } = await admin
      .from("numeros")
      .select("numero")
      .eq("raffle_id", row.raffle_id)
      .eq("es_bendecido", true);
    expect(blessed).toEqual([]);
    const { data: raffle } = await admin.from("raffles").select("numeros_bendecidos").eq("id", row.raffle_id).single();
    expect(raffle?.numeros_bendecidos).toEqual([]);
  });

  it("the bare crear_organizacion RPC enforces the same one-organization-per-caller guard", async () => {
    const user = await createAuthedUser("onb-bare");
    createdUserIds.push(user.userId);

    const first = await user.client.rpc("crear_organizacion", { p_nombre: "Bare", p_subdomain: sub("onb-bare-1") });
    expect(first.error).toBeNull();
    const second = await user.client.rpc("crear_organizacion", { p_nombre: "Bare 2", p_subdomain: sub("onb-bare-2") });
    expect(second.error).not.toBeNull();
  });

  it("is not callable without an authenticated user (anon + service role without JWT)", async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await anon.rpc("crear_organizacion_con_rifa", args(sub("onb-anon")))).error).not.toBeNull();
    expect((await admin.rpc("crear_organizacion_con_rifa", args(sub("onb-svc")))).error).not.toBeNull();
  });

  it("has no client-suppliable organization_id parameter", async () => {
    const user = await createAuthedUser("onb-param");
    createdUserIds.push(user.userId);
    const { error } = await user.client.rpc("crear_organizacion_con_rifa", {
      ...args(sub("onb-param")),
      p_organization_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
  });
});
