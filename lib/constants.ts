export const PRICE_PER_NUMBER = 200;
export const MIN_CUSTOM_QTY = 65;
// keep in sync with the p_cantidad > 200 check in supabase/migrations/0001_init.sql
export const MAX_CUSTOM_QTY = 200;

export const SORTEO_FECHA = "15 OCT 2026";

export const NEQUI_NUMERO = "3015649719";
export const NEQUI_NOMBRE = "Jairo Mendoza";

// "custom" is the reserved sentinel for the free-quantity picker (never a
// real package's own tipo, which is always a dynamic `paquete_<qty>` tag --
// see lib/onboarding/validate.ts/lib/raffle-config/validate.ts). Every other
// value is tenant-specific, so this can't be a fixed literal union.
export type PaqueteTipo = string;

export interface Paquete {
  tipo: PaqueteTipo;
  qty: number;
  priceLabel: string;
  price: number;
  popular: boolean;
}

export const PAQUETES: Paquete[] = [
  { tipo: "paquete_65", qty: 65, priceLabel: "13.000", price: 13000, popular: false },
  { tipo: "paquete_100", qty: 100, priceLabel: "20.000", price: 20000, popular: true },
  { tipo: "paquete_120", qty: 120, priceLabel: "24.000", price: 24000, popular: false },
];

export function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO").format(amount);
}

export function clampCustomQty(value: number, fallback: number = MIN_CUSTOM_QTY): number {
  return Number.isNaN(value) ? fallback : Math.min(MAX_CUSTOM_QTY, Math.max(MIN_CUSTOM_QTY, value));
}

// Raffle numbers are stored as plain integers (0-99999) — padding is a display-only
// concern. Use this whenever a raffle number is shown to a person (e.g. the
// payment-confirmed email, an admin view).
export function formatNumero(numero: number): string {
  return numero.toString().padStart(5, "0");
}
