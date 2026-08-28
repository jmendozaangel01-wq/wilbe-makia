export const PRICE_PER_NUMBER = 200;
export const MIN_CUSTOM_QTY = 65;
// keep in sync with the p_cantidad > 200 check in supabase/migrations/0001_init.sql
export const MAX_CUSTOM_QTY = 200;

export const SORTEO_FECHA = "15 OCT 2026";

export const NEQUI_NUMERO = "3015649719";
export const NEQUI_NOMBRE = "Wilber Makia";

export type PaqueteTipo = "paquete_65" | "paquete_100" | "paquete_120" | "custom";

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

export const BLESSED_NUMBERS = [
  "07734",
  "12583",
  "29461",
  "33780",
  "41256",
  "50912",
  "62347",
  "70594",
  "81023",
  "92468",
  "10357",
  "23689",
  "34781",
  "45902",
  "56134",
];

export function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO").format(amount);
}

export function clampCustomQty(value: number, fallback: number = MIN_CUSTOM_QTY): number {
  return Number.isNaN(value) ? fallback : Math.min(MAX_CUSTOM_QTY, Math.max(MIN_CUSTOM_QTY, value));
}

// Raffle numbers are stored as plain integers (0-99999) — padding is a display-only
// concern. Use this whenever a raffle number is shown to a person (e.g. the
// payment-confirmed email, an admin view), matching the BLESSED_NUMBERS format above.
export function formatNumero(numero: number): string {
  return numero.toString().padStart(5, "0");
}
