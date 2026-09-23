"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateOnboardingInput, type OnboardingErrors, type OnboardingInput } from "@/lib/onboarding/validate";
import { buildTenantAdminUrl } from "@/lib/onboarding/routing";

export type OnboardingState =
  | { status: "idle" }
  | { status: "error"; error?: string; fieldErrors: OnboardingErrors; values: OnboardingInput };

const FIELDS: (keyof OnboardingInput)[] = [
  "orgName",
  "subdomain",
  "raffleName",
  "maxNumero",
  "precioPorNumero",
  "sorteoFecha",
  "nequiNumero",
  "nequiNombre",
  "numerosBendecidos",
];

const GENERIC_ERROR = "We could not create your organization. Please try again in a few minutes.";

function readInput(formData: FormData): OnboardingInput {
  return Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? "")])) as unknown as OnboardingInput;
}

/**
 * Wizard submit. Runs crear_organizacion_con_rifa under the CALLER's own
 * session (SSR client, anon key + user JWT) -- never the service-role client,
 * because the RPC derives the owner from auth.uid(). Validation here only
 * produces friendly field errors; the RPC and table constraints are the real
 * boundary.
 */
export async function createOrganizationAction(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const values = readInput(formData);
  const validated = validateOnboardingInput(values);

  if (!validated.ok) {
    return { status: "error", fieldErrors: validated.errors, values };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const v = validated.value;
  const { data, error } = await supabase.rpc("crear_organizacion_con_rifa", {
    p_nombre: v.orgName,
    p_subdomain: v.subdomain,
    p_raffle_nombre: v.raffleName,
    p_max_numero: v.maxNumero,
    p_precio_por_numero: v.precioPorNumero,
    p_paquetes: v.paquetes,
    p_numeros_bendecidos: v.numerosBendecidos,
    p_sorteo_fecha: v.sorteoFecha,
    p_nequi_numero: v.nequiNumero,
    p_nequi_nombre: v.nequiNombre,
  });

  if (error) {
    if (error.code === "23505") {
      return { status: "error", fieldErrors: { subdomain: "That subdomain is already taken." }, values };
    }
    if (error.message.includes("Subdomain")) {
      return {
        status: "error",
        fieldErrors: { subdomain: "That subdomain is not available. Please choose another one." },
        values,
      };
    }
    if (error.message.includes("Ya perteneces")) {
      // Double submit or a second tab: the organization already exists.
      redirect("/admin");
    }
    console.error("[onboarding] crear_organizacion_con_rifa failed", { code: error.code, message: error.message });
    return { status: "error", error: GENERIC_ERROR, fieldErrors: {}, values };
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.error("[onboarding] crear_organizacion_con_rifa returned no rows");
    return { status: "error", error: GENERIC_ERROR, fieldErrors: {}, values };
  }

  const headerList = await headers();
  const host = headerList.get("host") ?? "";
  redirect(buildTenantAdminUrl(v.subdomain, host));
}
