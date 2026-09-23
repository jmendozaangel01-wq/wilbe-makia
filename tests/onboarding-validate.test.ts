import { describe, expect, it } from "vitest";
import { validateOnboardingInput, type OnboardingInput } from "../lib/onboarding/validate";

const valid: OnboardingInput = {
  orgName: "Acme Raffles",
  subdomain: "Acme-Raffles",
  raffleName: "Grand Raffle",
  maxNumero: "999",
  precioPorNumero: "200",
  sorteoFecha: "15 OCT 2026",
  nequiNumero: "3001234567",
  nequiNombre: "Ana Perez",
  numerosBendecidos: "7, 42, 100",
};

describe("validateOnboardingInput", () => {
  it("accepts valid input and normalizes it (subdomain lowercased, numbers parsed)", () => {
    const result = validateOnboardingInput(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.subdomain).toBe("acme-raffles");
    expect(result.value.maxNumero).toBe(999);
    expect(result.value.precioPorNumero).toBe(200);
    expect(result.value.numerosBendecidos).toEqual([7, 42, 100]);
    expect(result.value.paquetes.length).toBeGreaterThan(0);
    for (const p of result.value.paquetes) {
      expect(p.qty).toBeLessThanOrEqual(1000);
      expect(p.price).toBe(p.qty * 200);
    }
  });

  it("treats blank blessed numbers as none", () => {
    const result = validateOnboardingInput({ ...valid, numerosBendecidos: "  " });
    expect(result.ok && result.value.numerosBendecidos).toEqual([]);
  });

  it.each(["www", "admin", "app", "api", "auth", "static", "WWW"])("rejects reserved subdomain %s", (s) => {
    const result = validateOnboardingInput({ ...valid, subdomain: s });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.subdomain).toBeDefined();
  });

  it.each(["a.b", "-abc", "abc-", "my_org", "with space", "", "x".repeat(64), "ñandú"])(
    "rejects invalid subdomain %j",
    (s) => {
      const result = validateOnboardingInput({ ...valid, subdomain: s });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.subdomain).toBeDefined();
    }
  );

  it("rejects out-of-range or non-integer raffle size and price", () => {
    for (const patch of [
      { maxNumero: "100000" },
      { maxNumero: "-1" },
      { maxNumero: "abc" },
      { maxNumero: "9.5" },
      { precioPorNumero: "0" },
      { precioPorNumero: "1.5" },
    ]) {
      expect(validateOnboardingInput({ ...valid, ...patch }).ok).toBe(false);
    }
  });

  it("rejects blessed numbers outside the raffle range or non-numeric", () => {
    expect(validateOnboardingInput({ ...valid, numerosBendecidos: "5000" }).ok).toBe(false);
    expect(validateOnboardingInput({ ...valid, numerosBendecidos: "7, x" }).ok).toBe(false);
  });

  it("de-duplicates blessed numbers", () => {
    const result = validateOnboardingInput({ ...valid, numerosBendecidos: "7,7,8" });
    expect(result.ok && result.value.numerosBendecidos).toEqual([7, 8]);
  });

  it("requires names, draw date and a 10-digit Nequi number", () => {
    for (const patch of [
      { orgName: " " },
      { raffleName: "" },
      { sorteoFecha: "" },
      { nequiNombre: "" },
      { nequiNumero: "12345" },
      { nequiNumero: "30012345ab" },
    ]) {
      expect(validateOnboardingInput({ ...valid, ...patch }).ok).toBe(false);
    }
  });
});
