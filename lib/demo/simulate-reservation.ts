import { MAX_CUSTOM_QTY, MIN_CUSTOM_QTY, formatNumero } from "../constants";

/**
 * Pure, client-safe helpers behind the marketing landing's demo raffle. The
 * demo must never reach the server: nothing here imports server modules, calls
 * fetch, or reads personal fields from the form.
 */

export const DEMO_SENDING_DELAY_MS = 1400;
export const DEMO_SAMPLE_COUNT = 6;

const MAX_RAFFLE_NUMBER = 99999;

export type DemoReservationState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; cantidad: number; sampleNumbers: string[] };

// Structurally identical to ReservationState in app/actions.ts (not imported
// on purpose: that module is "use server" and pulls in server-only code).
type ReservationActionState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; cantidad: number };

type ReservationAction<S> = (prev: S, formData: FormData) => Promise<S>;

/** Picks `count` unique random raffle numbers, sorted and zero-padded for display. */
export function generateSampleNumbers(count: number, random: () => number = Math.random): string[] {
  const picked = new Set<number>();
  const target = Math.min(count, MAX_RAFFLE_NUMBER + 1);
  while (picked.size < target) {
    let n = Math.min(MAX_RAFFLE_NUMBER, Math.floor(random() * (MAX_RAFFLE_NUMBER + 1)));
    // On collision walk forward so the loop always terminates, even with a degenerate PRNG.
    while (picked.has(n)) n = (n + 1) % (MAX_RAFFLE_NUMBER + 1);
    picked.add(n);
  }
  return [...picked].sort((a, b) => a - b).map(formatNumero);
}

export function simulateReservation(
  cantidad: number,
  random: () => number = Math.random
): Extract<DemoReservationState, { status: "success" }> {
  return {
    status: "success",
    cantidad,
    sampleNumbers: generateSampleNumbers(Math.min(cantidad, DEMO_SAMPLE_COUNT), random),
  };
}

interface DemoOptions {
  delayMs?: number;
  wait?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Drop-in replacement for submitReservation in the demo. Only the hidden
 * `cantidad` field is read (to echo the package size); name, email, phone,
 * address and the receipt file are ignored and never leave the browser.
 */
export async function runDemoReservation(
  _prev: ReservationActionState,
  formData: FormData,
  { delayMs = DEMO_SENDING_DELAY_MS, wait = defaultWait, random = Math.random }: DemoOptions = {}
): Promise<Extract<DemoReservationState, { status: "success" }>> {
  const raw = Number(formData.get("cantidad"));
  const cantidad = Number.isInteger(raw) && raw > 0 && raw <= MAX_CUSTOM_QTY ? raw : MIN_CUSTOM_QTY;
  await wait(delayMs);
  return simulateReservation(cantidad, random);
}

/** Chooses the submit handler: the local simulation in demo mode, otherwise the real action, untouched. */
export function pickReservationAction(
  demo: boolean,
  real: ReservationAction<ReservationActionState>
): ReservationAction<ReservationActionState> {
  return demo ? (runDemoReservation as ReservationAction<ReservationActionState>) : real;
}
