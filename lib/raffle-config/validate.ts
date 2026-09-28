import {
  parseInteger,
  requiredText,
  MAX_PRICE,
  MAX_BLESSED,
  DEFAULT_PACKAGE_QUANTITIES,
  type OnboardingPaquete,
} from "../onboarding/validate";

/**
 * Pure server-side validation for the tenant admin's raffle configuration
 * form (post-onboarding edit, product/tenant-admin-raffle-config in engram).
 * Mirrors lib/onboarding/validate.ts's field-level rules for the fields this
 * form can change -- deliberately EXCLUDES orgName, subdomain and maxNumero:
 * none of those are editable after creation (subdomain never; maxNumero
 * would require reseeding the numeros pool, out of scope for this form, see
 * 0015_raffle_config_update.sql's header comment).
 *
 * actualizar_rifa() (0015) remains the real boundary; this only returns
 * field-level errors and normalizes input, same division of labor as the
 * onboarding validator.
 */

export interface RaffleConfigInput {
  raffleName: string;
  precioPorNumero: string;
  sorteoFecha: string;
  nequiNumero: string;
  nequiNombre: string;
  numerosBendecidos: string;
}

export interface RaffleConfigValue {
  raffleName: string;
  precioPorNumero: number;
  paquetes: OnboardingPaquete[];
  numerosBendecidos: number[];
  sorteoFecha: string;
  nequiNumero: string;
  nequiNombre: string;
}

export type RaffleConfigField = keyof RaffleConfigInput;
export type RaffleConfigErrors = Partial<Record<RaffleConfigField, string>>;

export type RaffleConfigResult =
  | { ok: true; value: RaffleConfigValue }
  | { ok: false; errors: RaffleConfigErrors };

/**
 * @param maxNumero The raffle's current max_numero, fetched server-side.
 * Never client-suppliable here -- this form can't change it, but blessed
 * numbers and package quantities are still bounded by it.
 */
export function validateRaffleConfigInput(input: RaffleConfigInput, maxNumero: number): RaffleConfigResult {
  const errors: RaffleConfigErrors = {};

  const raffleName = requiredText(input.raffleName, 80, "Ingresa el nombre de la rifa (máximo 80 caracteres).");
  if (raffleName.error) errors.raffleName = raffleName.error;

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
    if (unique.some((n) => n === null || n < 0 || n > maxNumero) || unique.length > MAX_BLESSED) {
      errors.numerosBendecidos = `Usa hasta ${MAX_BLESSED} números separados por comas, dentro del rango de la rifa.`;
    } else {
      numerosBendecidos = unique as number[];
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const pool = maxNumero + 1;
  const quantities = DEFAULT_PACKAGE_QUANTITIES.filter((q) => q <= pool);
  const paquetes = (quantities.length > 0 ? quantities : [pool]).map((qty) => ({
    tipo: `paquete_${qty}`,
    qty,
    price: qty * precio!,
  }));

  return {
    ok: true,
    value: {
      raffleName: raffleName.value!,
      precioPorNumero: precio!,
      paquetes,
      numerosBendecidos,
      sorteoFecha: sorteoFecha.value!,
      nequiNumero,
      nequiNombre: nequiNombre.value!,
    },
  };
}
