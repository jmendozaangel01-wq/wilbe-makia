import { describe, expect, it } from "vitest";
import { validateRaffleConfigInput, type RaffleConfigInput } from "../lib/raffle-config/validate";

const MAX_NUMERO = 999;

const valid: RaffleConfigInput = {
  raffleName: "Grand Raffle",
  premioNombre: "Gánate una moto XTZ 660 0-KM",
  precioPorNumero: "200",
  sorteoFecha: "15 OCT 2026",
  nequiNumero: "3001234567",
  nequiNombre: "Ana Perez",
  numerosBendecidos: "7, 42, 100",
};

describe("validateRaffleConfigInput", () => {
  it("accepts valid input and normalizes it (numbers parsed, packages recomputed)", () => {
    const result = validateRaffleConfigInput(valid, MAX_NUMERO);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.raffleName).toBe("Grand Raffle");
    expect(result.value.precioPorNumero).toBe(200);
    expect(result.value.numerosBendecidos).toEqual([7, 42, 100]);
    expect(result.value.paquetes.length).toBeGreaterThan(0);
    for (const p of result.value.paquetes) {
      expect(p.qty).toBeLessThanOrEqual(MAX_NUMERO + 1);
      expect(p.price).toBe(p.qty * 200);
    }
  });

  it("does not accept or return orgName/subdomain/maxNumero fields at all", () => {
    const result = validateRaffleConfigInput(valid, MAX_NUMERO);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty("orgName");
    expect(result.value).not.toHaveProperty("subdomain");
    expect(result.value).not.toHaveProperty("maxNumero");
  });

  it("treats blank blessed numbers as none", () => {
    const result = validateRaffleConfigInput({ ...valid, numerosBendecidos: "  " }, MAX_NUMERO);
    expect(result.ok && result.value.numerosBendecidos).toEqual([]);
  });

  it("rejects a blessed number above the raffle's current max_numero", () => {
    const result = validateRaffleConfigInput({ ...valid, numerosBendecidos: `${MAX_NUMERO + 1}` }, MAX_NUMERO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.numerosBendecidos).toBeDefined();
  });

  it("rejects an empty raffle name", () => {
    const result = validateRaffleConfigInput({ ...valid, raffleName: "  " }, MAX_NUMERO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.raffleName).toBeDefined();
  });

  it("keeps the prize title exactly as typed, trimmed", () => {
    const result = validateRaffleConfigInput({ ...valid, premioNombre: "  Dos motos NKD 125  " }, MAX_NUMERO);
    expect(result.ok && result.value.premioNombre).toBe("Dos motos NKD 125");
  });

  it.each(["", "   ", "x".repeat(121)])("rejects an empty or over-long prize title %j", (premioNombre) => {
    const result = validateRaffleConfigInput({ ...valid, premioNombre }, MAX_NUMERO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.premioNombre).toBeDefined();
  });

  it("accepts a prize title of exactly 120 characters", () => {
    expect(validateRaffleConfigInput({ ...valid, premioNombre: "x".repeat(120) }, MAX_NUMERO).ok).toBe(true);
  });

  it("rejects a price of zero or below", () => {
    const result = validateRaffleConfigInput({ ...valid, precioPorNumero: "0" }, MAX_NUMERO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.precioPorNumero).toBeDefined();
  });

  it("rejects a nequi number that isn't exactly 10 digits", () => {
    const result = validateRaffleConfigInput({ ...valid, nequiNumero: "12345" }, MAX_NUMERO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.nequiNumero).toBeDefined();
  });

  it("rejects an empty nequi holder name", () => {
    const result = validateRaffleConfigInput({ ...valid, nequiNombre: "" }, MAX_NUMERO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.nequiNombre).toBeDefined();
  });

  it("rejects an empty sorteo date", () => {
    const result = validateRaffleConfigInput({ ...valid, sorteoFecha: "" }, MAX_NUMERO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.sorteoFecha).toBeDefined();
  });
});
