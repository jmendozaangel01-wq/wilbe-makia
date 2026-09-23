import { isReservedSubdomain } from "../tenant/subdomain";

/**
 * Pure server-side validation for the onboarding wizard. crear_organizacion_con_rifa()
 * (0012) and the raffles table CHECK constraints remain the real boundary;
 * this exists to return field-level errors to the wizard instead of a raw
 * Postgres exception, and to normalize input (lowercase subdomain, parsed
 * numbers). Keep the subdomain regex in sync with 0010/0012.
 */

// Same DNS-label shape enforced by crear_organizacion() in SQL.
const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

// Matches raffles.max_numero check (0006): 0..99999. The wizard additionally
// requires a pool of at least 10 numbers so the default packages make sense.
const MIN_MAX_NUMERO = 9;
const MAX_MAX_NUMERO = 99_999;
const MAX_PRICE = 10_000_000;
const MAX_BLESSED = 50;
const DEFAULT_PACKAGE_QUANTITIES = [10, 50, 100];

export interface OnboardingInput {
  orgName: string;
  subdomain: string;
  raffleName: string;
  maxNumero: string;
  precioPorNumero: string;
  sorteoFecha: string;
  nequiNumero: string;
  nequiNombre: string;
  numerosBendecidos: string;
}

export interface OnboardingPaquete {
  tipo: string;
  qty: number;
  price: number;
}

export interface OnboardingValue {
  orgName: string;
  subdomain: string;
  raffleName: string;
  maxNumero: number;
  precioPorNumero: number;
  paquetes: OnboardingPaquete[];
  numerosBendecidos: number[];
  sorteoFecha: string;
  nequiNumero: string;
  nequiNombre: string;
}

export type OnboardingField = keyof OnboardingInput;
export type OnboardingErrors = Partial<Record<OnboardingField, string>>;

export type OnboardingResult = { ok: true; value: OnboardingValue } | { ok: false; errors: OnboardingErrors };

function parseInteger(raw: string): number | null {
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

function requiredText(raw: string, max: number, message: string): { value?: string; error?: string } {
  const value = raw.trim();
  if (value.length === 0 || value.length > max) {
    return { error: message };
  }
  return { value };
}

export function validateOnboardingInput(input: OnboardingInput): OnboardingResult {
  const errors: OnboardingErrors = {};

  const orgName = requiredText(input.orgName, 60, "Ingresa el nombre de tu organización (máximo 60 caracteres).");
  if (orgName.error) errors.orgName = orgName.error;

  const subdomain = input.subdomain.trim().toLowerCase();
  if (!SUBDOMAIN_PATTERN.test(subdomain)) {
    errors.subdomain = "Usa de 1 a 63 letras minúsculas, números o guiones (sin guion al inicio ni al final).";
  } else if (isReservedSubdomain(subdomain)) {
    errors.subdomain = "Ese subdominio está reservado. Elige otro.";
  }

  const raffleName = requiredText(input.raffleName, 80, "Ingresa el nombre de la rifa (máximo 80 caracteres).");
  if (raffleName.error) errors.raffleName = raffleName.error;

  const maxNumero = parseInteger(input.maxNumero);
  if (maxNumero === null || maxNumero < MIN_MAX_NUMERO || maxNumero > MAX_MAX_NUMERO) {
    errors.maxNumero = `Ingresa un número entero entre ${MIN_MAX_NUMERO} y ${MAX_MAX_NUMERO}.`;
  }

  const precio = parseInteger(input.precioPorNumero);
  if (precio === null || precio < 1 || precio > MAX_PRICE) {
    errors.precioPorNumero = `Ingresa un precio entero entre 1 y ${MAX_PRICE}.`;
  }

  const sorteoFecha = requiredText(input.sorteoFecha, 40, "Ingresa la fecha del sorteo (máximo 40 caracteres).");
  if (sorteoFecha.error) errors.sorteoFecha = sorteoFecha.error;

  const nequiNumero = input.nequiNumero.trim();
  if (!/^\d{10}$/.test(nequiNumero)) {
    errors.nequiNumero = "Ingresa un número Nequi de 10 dígitos.";
  }

  const nequiNombre = requiredText(input.nequiNombre, 80, "Ingresa el nombre del titular de la cuenta Nequi.");
  if (nequiNombre.error) errors.nequiNombre = nequiNombre.error;

  let numerosBendecidos: number[] = [];
  const blessedRaw = input.numerosBendecidos.trim();
  if (blessedRaw.length > 0) {
    const parsed = blessedRaw.split(",").map((part) => parseInteger(part));
    const unique = [...new Set(parsed)];
    const upperBound = maxNumero ?? MAX_MAX_NUMERO;
    if (
      unique.some((n) => n === null || n > upperBound) ||
      unique.length > MAX_BLESSED
    ) {
      errors.numerosBendecidos = `Usa hasta ${MAX_BLESSED} números separados por comas, dentro del rango de la rifa.`;
    } else {
      numerosBendecidos = unique as number[];
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const pool = maxNumero! + 1;
  const quantities = DEFAULT_PACKAGE_QUANTITIES.filter((q) => q <= pool);
  const paquetes = (quantities.length > 0 ? quantities : [pool]).map((qty) => ({
    tipo: `paquete_${qty}`,
    qty,
    price: qty * precio!,
  }));

  return {
    ok: true,
    value: {
      orgName: orgName.value!,
      subdomain,
      raffleName: raffleName.value!,
      maxNumero: maxNumero!,
      precioPorNumero: precio!,
      paquetes,
      numerosBendecidos,
      sorteoFecha: sorteoFecha.value!,
      nequiNumero,
      nequiNombre: nequiNombre.value!,
    },
  };
}
