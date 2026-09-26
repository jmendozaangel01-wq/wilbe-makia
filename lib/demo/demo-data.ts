import type { Paquete } from "../constants";

/**
 * Static, fictional dataset behind the marketing landing's demo raffle. It is
 * deliberately independent from tenant data, Supabase and the real payment
 * constants: nothing here describes a real person, brand, prize or account.
 */

const PRICE_PER_NUMBER = 200;

const packages: Paquete[] = [
  { tipo: "paquete_65", qty: 65, price: 65 * PRICE_PER_NUMBER, priceLabel: "13.000", popular: false },
  { tipo: "paquete_100", qty: 100, price: 100 * PRICE_PER_NUMBER, priceLabel: "20.000", popular: true },
  { tipo: "paquete_120", qty: 120, price: 120 * PRICE_PER_NUMBER, priceLabel: "24.000", popular: false },
];

const blessedNumbers = [
  "01111",
  "07070",
  "12345",
  "21212",
  "24680",
  "31313",
  "40404",
  "48888",
  "55555",
  "60606",
  "71717",
  "77777",
  "80808",
  "90909",
  "99999",
];

export const DEMO_RAFFLE = {
  organizerName: "Rifas Demo",
  prizeName: "Moto 0 km (ejemplo)",
  drawDate: "31 DIC 2026",
  pricePerNumber: PRICE_PER_NUMBER,
  minCustomQty: 65,
  maxCustomQty: 200,
  packages,
  soldPercent: 68,
  blessedPrize: "$50.000",
  blessedNumbers,
  soldBlessedNumbers: ["12345", "55555", "77777"],
  payment: {
    method: "Nequi",
    number: "300 000 0000",
    holder: "Titular de Ejemplo",
    qrLabel: "QR de ejemplo",
  },
} as const;
