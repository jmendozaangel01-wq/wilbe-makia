import { describe, expect, it, vi } from "vitest";
import {
  DEMO_SAMPLE_COUNT,
  generateSampleNumbers,
  pickReservationAction,
  runDemoReservation,
  simulateReservation,
} from "../lib/demo/simulate-reservation";

// Deterministic PRNG so the sample numbers are reproducible in tests.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("generateSampleNumbers", () => {
  it("returns the requested amount of unique, sorted, 5-digit padded numbers", () => {
    const numbers = generateSampleNumbers(6, seeded(1));
    expect(numbers).toHaveLength(6);
    expect(new Set(numbers).size).toBe(6);
    for (const n of numbers) expect(n).toMatch(/^\d{5}$/);
    expect([...numbers].sort()).toEqual(numbers);
  });

  it("never returns numbers outside 00000-99999", () => {
    const numbers = generateSampleNumbers(50, () => 0.9999999);
    for (const n of numbers) {
      expect(Number(n)).toBeGreaterThanOrEqual(0);
      expect(Number(n)).toBeLessThanOrEqual(99999);
    }
  });
});

describe("simulateReservation", () => {
  it("echoes the quantity and caps the sample list", () => {
    const result = simulateReservation(100, seeded(2));
    expect(result.status).toBe("success");
    expect(result.cantidad).toBe(100);
    expect(result.sampleNumbers).toHaveLength(DEMO_SAMPLE_COUNT);
  });

  it("does not return more samples than the quantity", () => {
    expect(simulateReservation(3, seeded(3)).sampleNumbers).toHaveLength(3);
  });
});

describe("runDemoReservation", () => {
  const form = new FormData();
  form.set("cantidad", "65");
  form.set("nombre", "Persona Real");
  form.set("correo", "real@example.com");

  it("waits the simulated delay and then resolves a success state", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const state = await runDemoReservation({ status: "idle" }, form, { wait, delayMs: 500, random: seeded(4) });
    expect(wait).toHaveBeenCalledWith(500);
    expect(state.status).toBe("success");
    if (state.status === "success") expect(state.cantidad).toBe(65);
  });

  it("never touches the network or leaks form data", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const state = await runDemoReservation({ status: "idle" }, form, { wait: async () => {}, random: seeded(5) });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).not.toContain("Persona Real");
    expect(JSON.stringify(state)).not.toContain("real@example.com");
    fetchSpy.mockRestore();
  });

  it("falls back to a valid quantity when the hidden field is tampered with", async () => {
    const bad = new FormData();
    bad.set("cantidad", "abc");
    const state = await runDemoReservation({ status: "idle" }, bad, { wait: async () => {} });
    expect(state.status).toBe("success");
    if (state.status === "success") expect(state.cantidad).toBeGreaterThan(0);
  });
});

describe("pickReservationAction", () => {
  it("returns the simulation and never the real action when demo is on", async () => {
    const real = vi.fn();
    const action = pickReservationAction(true, real);
    expect(action).not.toBe(real);
    const fd = new FormData();
    fd.set("cantidad", "100");
    await action({ status: "idle" }, fd);
    expect(real).not.toHaveBeenCalled();
  });

  it("returns the real action untouched when demo is off", () => {
    const real = vi.fn();
    expect(pickReservationAction(false, real)).toBe(real);
  });
});
