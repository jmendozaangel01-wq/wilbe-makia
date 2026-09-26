import { beforeEach, describe, expect, it, vi } from "vitest";

// Server-side defense in depth for the apex demo: submitReservation must refuse
// any request whose Host classifies as the marketing view (apex, www, preview
// hosts, localhost) BEFORE any DB read/write, Storage upload or email. Pure
// mocks, no database needed.

const mocks = vi.hoisted(() => {
  const chain: Record<string, unknown> = {};
  const from = vi.fn(() => chain);
  const rpc = vi.fn(async () => ({ data: null, error: { message: "should not be called" } }));
  const upload = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(async () => ({ error: null }));
  const storageFrom = vi.fn(() => ({ upload, remove }));
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = async () => ({ data: { id: "raffle-1" }, error: null });
  chain.update = () => chain;
  return {
    host: "" as string,
    from,
    rpc,
    upload,
    remove,
    storageFrom,
    resolveOrganizationByHost: vi.fn(async () => ({ id: "org-1" })),
    sendComprobanteRecibidoEmail: vi.fn(async () => {}),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(mocks.host ? { host: mocks.host } : {}),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc, storage: { from: mocks.storageFrom } }),
}));
vi.mock("@/lib/tenant/resolve", () => ({ resolveOrganizationByHost: mocks.resolveOrganizationByHost }));
vi.mock("@/lib/email", () => ({ sendComprobanteRecibidoEmail: mocks.sendComprobanteRecibidoEmail }));

const { submitReservation } = await import("../app/actions");

function jpegFile(): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])], "c.jpg", { type: "image/jpeg" });
}

function validForm(): FormData {
  const fd = new FormData();
  fd.set("nombre", "Test");
  fd.set("apellido", "Buyer");
  fd.set("correo", "buyer@example.com");
  fd.set("whatsapp", "3000000000");
  fd.set("direccion", "Calle Falsa 123");
  fd.set("ciudad", "Cartagena");
  fd.set("paqueteTipo", "paquete_65");
  fd.set("cantidad", "65");
  fd.set("comprobante", jpegFile());
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.host = "";
});

describe("submitReservation on marketing hosts", () => {
  it.each(["benditarifa.com", "www.benditarifa.com", "localhost:3000", "127.0.0.1:3000", "my-preview-abc.vercel.app"])(
    "rejects host %s without touching DB, Storage or email",
    async (host) => {
      mocks.host = host;
      const result = await submitReservation({ status: "idle" }, validForm());

      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.error).toMatch(/demo|no est/i);
        expect(result.error).not.toMatch(/Intentá|Escribinos|Probá/);
      }
      expect(mocks.resolveOrganizationByHost).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.storageFrom).not.toHaveBeenCalled();
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.sendComprobanteRecibidoEmail).not.toHaveBeenCalled();
    }
  );
});

describe("submitReservation on tenant hosts", () => {
  it("still resolves the organization and proceeds past the guard", async () => {
    mocks.host = "acme.benditarifa.com";
    await submitReservation({ status: "idle" }, validForm());
    expect(mocks.resolveOrganizationByHost).toHaveBeenCalledWith("acme.benditarifa.com");
    expect(mocks.from).toHaveBeenCalledWith("raffles");
  });

  it("works for <sub>.localhost dev hosts too", async () => {
    mocks.host = "acme.localhost:3000";
    await submitReservation({ status: "idle" }, validForm());
    expect(mocks.resolveOrganizationByHost).toHaveBeenCalledWith("acme.localhost:3000");
  });
});
