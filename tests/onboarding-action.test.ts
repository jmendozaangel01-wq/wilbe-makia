import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthedUser, deleteTestUser } from "./helpers/auth";

// createOrganizationAction (onboarding wizard submit): validates, calls the
// atomic crear_organizacion_con_rifa RPC under the CALLER's own session
// (auth.uid() must resolve -- never the service-role client), then redirects
// into the new tenant's admin. next/* and the SSR Supabase client are faked;
// the RPC itself runs against real local Postgres.

const mockState = vi.hoisted(() => ({
  client: null as SupabaseClient | null,
  host: "benditarifa.com",
}));

class RedirectError extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: mockState.host }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mockState.client,
}));

const { createOrganizationAction } = await import("../app/onboarding/actions");

let admin: SupabaseClient;
const userIds: string[] = [];
const subdomains: string[] = [];

beforeAll(() => {
  admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

afterAll(async () => {
  for (const s of subdomains) {
    const { data: org } = await admin.from("organizations").select("id").eq("subdomain", s).maybeSingle();
    if (org) {
      await admin.from("numeros").delete().eq("organization_id", org.id);
      await admin.from("raffles").delete().eq("organization_id", org.id);
      await admin.from("organization_members").delete().eq("organization_id", org.id);
      await admin.from("organizations").delete().eq("id", org.id);
    }
  }
  for (const id of userIds) await deleteTestUser(id);
});

let seq = 0;
function form(subdomain: string, overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    orgName: "Action Org",
    subdomain,
    raffleName: "Action Raffle",
    maxNumero: "99",
    precioPorNumero: "200",
    sorteoFecha: "15 OCT 2026",
    nequiNumero: "3001234567",
    nequiNombre: "Ana Perez",
    numerosBendecidos: "7",
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function uniqueSub(tag: string) {
  const s = `${tag}-${Date.now().toString(36)}${seq++}`;
  subdomains.push(s);
  return s;
}

async function run(fd: FormData) {
  try {
    return { state: await createOrganizationAction({ status: "idle" }, fd), redirect: null as string | null };
  } catch (err) {
    if (err instanceof RedirectError) return { state: null, redirect: err.url };
    throw err;
  }
}

describe("createOrganizationAction", () => {
  it("creates the organization + raffle and redirects to the tenant admin", async () => {
    const user = await createAuthedUser("act-ok");
    userIds.push(user.userId);
    mockState.client = user.client;
    const subdomain = uniqueSub("act-ok");

    const result = await run(form(subdomain));
    expect(result.redirect).toBe(`https://${subdomain}.benditarifa.com/admin`);

    const { data: org } = await admin.from("organizations").select("id").eq("subdomain", subdomain).single();
    const { data: raffle } = await admin.from("raffles").select("estado, nombre").eq("organization_id", org!.id);
    expect(raffle).toEqual([{ estado: "activa", nombre: "Action Raffle" }]);
  });

  it("returns field errors for invalid input without calling the database", async () => {
    const user = await createAuthedUser("act-invalid");
    userIds.push(user.userId);
    mockState.client = user.client;

    const result = await run(form("admin", { maxNumero: "abc" }));
    expect(result.redirect).toBeNull();
    expect(result.state).toMatchObject({ status: "error" });
    if (result.state?.status === "error") {
      expect(result.state.fieldErrors.subdomain).toBeDefined();
      expect(result.state.fieldErrors.maxNumero).toBeDefined();
    }

    const { data: members } = await admin.from("organization_members").select("id").eq("user_id", user.userId);
    expect(members).toEqual([]);
  });

  it("maps a taken subdomain to a subdomain field error", async () => {
    const [a, b] = await Promise.all([createAuthedUser("act-dup-a"), createAuthedUser("act-dup-b")]);
    userIds.push(a.userId, b.userId);
    const subdomain = uniqueSub("act-dup");

    mockState.client = a.client;
    expect((await run(form(subdomain))).redirect).not.toBeNull();

    mockState.client = b.client;
    const second = await run(form(subdomain));
    expect(second.state?.status).toBe("error");
    if (second.state?.status === "error") expect(second.state.fieldErrors.subdomain).toMatch(/en uso/i);
  });

  it("redirects an unauthenticated caller to login", async () => {
    const anon = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    mockState.client = anon;
    const result = await run(form(uniqueSub("act-anon")));
    expect(result.redirect).toBe("/admin/login");
  });
});
