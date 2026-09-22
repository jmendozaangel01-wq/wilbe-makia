"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminContext, type AdminContext } from "@/lib/auth/admin-context";
import { sendNumerosConfirmadosEmail, sendReservaRechazadaEmail } from "@/lib/email";

export type AdminActionResult = { ok: true } | { ok: false; error: string };
export type ComprobanteUrlResult = { ok: true; url: string } | { ok: false; error: string };

const GENERIC_ERROR_MESSAGE = "Hubo un problema al procesar la acción. Intenta de nuevo.";
const NO_RAFFLE_ERROR_MESSAGE = "Esta organización no tiene una rifa activa.";

function rpcErrorMessage(fallback: string, err: { message?: string } | null): string {
  return err?.message || fallback;
}

export async function confirmarPago(reservaId: string): Promise<AdminActionResult> {
  const context: AdminContext = await requireAdminContext();

  try {
    const supabase = createAdminClient();

    const { error } = await supabase.rpc("confirmar_pago_rifa", {
      p_organization_id: context.organizationId,
      p_reserva_id: reservaId,
    });

    if (error) {
      console.error("[admin] confirmar_pago_rifa failed", { reservaId, error: error.message });
      return { ok: false, error: rpcErrorMessage(GENERIC_ERROR_MESSAGE, error) };
    }

    const { data: reserva, error: fetchError } = await supabase
      .from("reservas")
      .select("correo, nombre, numeros_asignados")
      .eq("id", reservaId)
      .single();

    if (fetchError || !reserva) {
      console.error("[admin] failed to fetch confirmed reserva for email", {
        reservaId,
        error: fetchError?.message,
      });
      return { ok: true };
    }

    await sendNumerosConfirmadosEmail({
      to: reserva.correo,
      nombre: reserva.nombre,
      numeros: reserva.numeros_asignados as number[],
    });

    return { ok: true };
  } catch (err) {
    console.error("[admin] confirmarPago unexpected exception", {
      reservaId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
}

export async function rechazarReserva(reservaId: string): Promise<AdminActionResult> {
  const context: AdminContext = await requireAdminContext();

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc("rechazar_reserva_rifa", {
      p_organization_id: context.organizationId,
      p_reserva_id: reservaId,
    });

    if (error) {
      console.error("[admin] rechazar_reserva_rifa failed", { reservaId, error: error.message });
      return { ok: false, error: rpcErrorMessage(GENERIC_ERROR_MESSAGE, error) };
    }

    const { data: reserva, error: fetchError } = await supabase
      .from("reservas")
      .select("correo, nombre")
      .eq("id", reservaId)
      .single();

    if (fetchError || !reserva) {
      console.error("[admin] failed to fetch rejected reserva for email", {
        reservaId,
        error: fetchError?.message,
      });
      return { ok: true };
    }

    await sendReservaRechazadaEmail({ to: reserva.correo, nombre: reserva.nombre });

    return { ok: true };
  } catch (err) {
    console.error("[admin] rechazarReserva unexpected exception", {
      reservaId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
}

export async function editarNumero(
  reservaId: string,
  numeroAnterior: number,
  numeroNuevo: number
): Promise<AdminActionResult> {
  const context: AdminContext = await requireAdminContext();

  if (!context.raffleId) {
    return { ok: false, error: NO_RAFFLE_ERROR_MESSAGE };
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc("editar_numero_rifa", {
      p_organization_id: context.organizationId,
      p_raffle_id: context.raffleId,
      p_reserva_id: reservaId,
      p_numero_anterior: numeroAnterior,
      p_numero_nuevo: numeroNuevo,
    });

    if (error) {
      console.error("[admin] editar_numero_rifa failed", {
        reservaId,
        numeroAnterior,
        numeroNuevo,
        error: error.message,
      });
      return { ok: false, error: rpcErrorMessage(GENERIC_ERROR_MESSAGE, error) };
    }

    return { ok: true };
  } catch (err) {
    console.error("[admin] editarNumero unexpected exception", {
      reservaId,
      numeroAnterior,
      numeroNuevo,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
}

export async function reasignarNumeros(reservaId: string): Promise<AdminActionResult> {
  const context: AdminContext = await requireAdminContext();

  if (!context.raffleId) {
    return { ok: false, error: NO_RAFFLE_ERROR_MESSAGE };
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc("reasignar_numeros_rifa", {
      p_organization_id: context.organizationId,
      p_raffle_id: context.raffleId,
      p_reserva_id: reservaId,
    });

    if (error) {
      console.error("[admin] reasignar_numeros_rifa failed", { reservaId, error: error.message });
      return { ok: false, error: rpcErrorMessage(GENERIC_ERROR_MESSAGE, error) };
    }

    return { ok: true };
  } catch (err) {
    console.error("[admin] reasignarNumeros unexpected exception", {
      reservaId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
}

export async function getComprobanteUrl(reservaId: string): Promise<ComprobanteUrlResult> {
  const context: AdminContext = await requireAdminContext();

  try {
    const supabase = createAdminClient();

    // Tenant scoping: resolve the storage path from the reserva row itself,
    // scoped by the caller's organization_id, instead of trusting a raw
    // client-supplied path -- otherwise any admin could sign a URL for
    // another tenant's payment receipt by guessing/copying its path.
    const { data: reserva, error: reservaError } = await supabase
      .from("reservas")
      .select("comprobante_url")
      .eq("id", reservaId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (reservaError || !reserva) {
      console.error("[admin] getComprobanteUrl reserva lookup failed", {
        reservaId,
        error: reservaError?.message,
      });
      return { ok: false, error: "No se pudo cargar el comprobante." };
    }

    const path = (reserva as { comprobante_url: string | null }).comprobante_url;
    if (!path) {
      return { ok: false, error: "No se pudo cargar el comprobante." };
    }

    const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(path, 300);

    if (error || !data) {
      console.error("[admin] createSignedUrl failed", { reservaId, error: error?.message });
      return { ok: false, error: "No se pudo cargar el comprobante." };
    }

    return { ok: true, url: data.signedUrl };
  } catch (err) {
    console.error("[admin] getComprobanteUrl unexpected exception", {
      reservaId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
}
