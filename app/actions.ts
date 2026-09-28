"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendComprobanteRecibidoEmail } from "@/lib/email";
import { resolveOrganizationByHost } from "@/lib/tenant/resolve";
import { selectHomeView } from "@/lib/tenant/home-view";
import { MAX_CUSTOM_QTY, MIN_CUSTOM_QTY, type PaqueteTipo } from "@/lib/constants";
import { hasValidImageSignature } from "@/lib/storage/image-signature";

export type ReservationState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; cantidad: number };

interface ReservarNumerosRow {
  reserva_id: string;
  numeros_asignados: number[];
}

interface RafflePaquete {
  tipo: string;
  qty: number;
}

const MAX_COMPROBANTE_BYTES = 8 * 1024 * 1024;

const GENERIC_ERROR_MESSAGE =
  "Hubo un problema al procesar tu reserva. Por favor intenta de nuevo en unos minutos.";

const MARKETING_HOST_MESSAGE =
  "Esta es una demo: no se pueden hacer reservas reales aquí. Entra a la página de una rifa para comprar.";

const INVALID_IMAGE_MESSAGE ="El comprobante debe ser una imagen.";

export async function submitReservation(
  _prevState: ReservationState,
  formData: FormData
): Promise<ReservationState> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const apellido = String(formData.get("apellido") ?? "").trim();
  const correo = String(formData.get("correo") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const direccion = String(formData.get("direccion") ?? "").trim();
  const ciudad = String(formData.get("ciudad") ?? "").trim();
  const paqueteTipo = String(formData.get("paqueteTipo") ?? "") as PaqueteTipo;
  const cantidad = Number(formData.get("cantidad"));
  const comprobante = formData.get("comprobante");

  if (!nombre || !apellido || !correo || !whatsapp || !direccion || !ciudad) {
    return { status: "error", error: "Completa todos los campos del formulario." };
  }

  if (!(comprobante instanceof File) || comprobante.size === 0) {
    return { status: "error", error: "Adjunta el comprobante de pago." };
  }

  if (comprobante.size > MAX_COMPROBANTE_BYTES) {
    return { status: "error", error: "El comprobante no puede pesar más de 8 MB." };
  }

  if (!comprobante.type.startsWith("image/")) {
    return { status: "error", error: INVALID_IMAGE_MESSAGE };
  }

  // Host-based tenant resolution (design D6, same pattern as app/page.tsx /
  // app/layout.tsx). Required and load-bearing: submitReservation now calls
  // the tenant-scoped reservar_numeros_rifa RPC, which needs a resolved
  // raffle (and, transitively, its organization) to insert a reservas row
  // with organization_id/raffle_id actually set. An unresolved Host used to
  // fail-soft into the legacy flat storage path; it now fails the whole
  // reservation up front, before any Storage upload happens, since there is
  // no tenant to reserve numbers against.
  const supabase = createAdminClient();

  let organizationId: string;
  try {
    const headerList = await headers();
    const host = headerList.get("host");

    // The apex / www / preview / localhost hosts only serve the marketing
    // landing, whose raffle is a client-side simulation. Real reservations
    // exist only on tenant hosts, so refuse here -- before any DB read/write,
    // upload or email -- even if someone POSTs this action by hand.
    if (selectHomeView(host) === "marketing") {
      return { status: "error", error: MARKETING_HOST_MESSAGE };
    }

    const org = host ? await resolveOrganizationByHost(host) : null;

    if (!org) {
      return { status: "error", error: "No pudimos identificar la rifa. Por favor intenta de nuevo." };
    }

    organizationId = org.id;
  } catch (err) {
    console.error("[reserva] tenant resolution failed", err);
    return { status: "error", error: "No pudimos identificar la rifa. Por favor intenta de nuevo." };
  }

  let raffleId: string;
  {
    const { data: raffle, error: raffleError } = await supabase
      .from("raffles")
      .select("id, paquetes")
      .eq("organization_id", organizationId)
      .eq("estado", "activa")
      .maybeSingle();

    if (raffleError) {
      console.error("[reserva] active raffle lookup failed", { organizationId, error: raffleError.message });
      return { status: "error", error: GENERIC_ERROR_MESSAGE };
    }

    if (!raffle) {
      return { status: "error", error: "Esta rifa no está disponible en este momento." };
    }

    const row = raffle as { id: string; paquetes: RafflePaquete[] | null };
    raffleId = row.id;

    // Defense in depth for the jsonb column: both write paths
    // (crear_organizacion_con_rifa, actualizar_rifa) always persist an array,
    // but this guards against a malformed/corrupted value reaching .map()
    // uncaught (this runs before the function's own try/catch) instead of
    // failing the same clean way as "no active raffle" below.
    if (!Array.isArray(row.paquetes) || row.paquetes.length === 0) {
      console.error("[reserva] raffle has no usable paquetes", { organizationId, raffleId: row.id });
      return { status: "error", error: "Esta rifa no está disponible en este momento." };
    }

    // Package quantities are this tenant's own paquetes (raffles.paquetes),
    // never the legacy global PAQUETES constant -- every raffle beyond
    // Wilbermakia has its own tipo/qty pairs (see
    // lib/onboarding/validate.ts's DEFAULT_PACKAGE_QUANTITIES), so validating
    // against a different tenant's fixed quantities would silently reject
    // every real, correctly-priced submission for this raffle.
    const packageQuantities: Record<string, number> = Object.fromEntries(
      row.paquetes.map((p) => [p.tipo, p.qty])
    );

    const cantidadValida =
      paqueteTipo === "custom"
        ? Number.isInteger(cantidad) && cantidad >= MIN_CUSTOM_QTY && cantidad <= MAX_CUSTOM_QTY
        : packageQuantities[paqueteTipo] === cantidad;

    if (!cantidadValida) {
      return { status: "error", error: "La cantidad seleccionada no es válida." };
    }
  }

  // Read the file bytes once and reuse them for both the signature check and
  // the upload, instead of letting the SDK read the File object twice.
  const comprobanteBuffer = await comprobante.arrayBuffer();

  if (!hasValidImageSignature(comprobanteBuffer)) {
    return { status: "error", error: INVALID_IMAGE_MESSAGE };
  }

  let storagePath: string | undefined;

  try {
    const extension = comprobante.name.split(".").pop() || "jpg";
    storagePath = `${organizationId}/${randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("comprobantes")
      .upload(storagePath, comprobanteBuffer, {
        contentType: comprobante.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[reserva] upload failed", {
        correo,
        cantidad,
        paqueteTipo,
        storagePath,
        error: uploadError.message,
      });
      return { status: "error", error: "No se pudo subir el comprobante. Intenta de nuevo." };
    }

    const { data: reservaRows, error: reservaError } = await supabase.rpc("reservar_numeros_rifa", {
      p_raffle_id: raffleId,
      p_cantidad: cantidad,
      p_nombre: nombre,
      p_apellido: apellido,
      p_correo: correo,
      p_whatsapp: whatsapp,
      p_direccion: direccion,
      p_ciudad: ciudad,
      p_paquete_tipo: paqueteTipo,
    });

    const reserva = (reservaRows as ReservarNumerosRow[] | null)?.[0];

    if (reservaError || !reserva) {
      // The upload already succeeded — clean up the orphaned file since the
      // reservation itself failed (most commonly: two buyers collided on the
      // last remaining numbers).
      const { error: removeError } = await supabase.storage.from("comprobantes").remove([storagePath]);
      console.error("[reserva] reservar_numeros_rifa failed", {
        correo,
        cantidad,
        paqueteTipo,
        storagePath,
        error: reservaError?.message,
        cleanupError: removeError?.message,
      });

      const isSoldOut = reservaError?.message?.includes("No hay suficientes números disponibles");
      return {
        status: "error",
        error: isSoldOut
          ? "Se agotaron los números disponibles para esa cantidad, intenta con una cantidad menor."
          : GENERIC_ERROR_MESSAGE,
      };
    }

    let { error: verificacionError } = await supabase.rpc("marcar_en_verificacion", {
      p_reserva_id: reserva.reserva_id,
      p_comprobante_url: storagePath,
    });

    if (verificacionError) {
      // Single retry — transient blips are the common case.
      ({ error: verificacionError } = await supabase.rpc("marcar_en_verificacion", {
        p_reserva_id: reserva.reserva_id,
        p_comprobante_url: storagePath,
      }));
    }

    if (verificacionError) {
      // Still failing after the retry: the reservation is stuck in
      // 'pendiente_pago' with no comprobante_url recorded, even though the
      // upload and the number reservation both succeeded. Push expira_en far
      // out so the once-a-minute liberar_reservas_expiradas sweep doesn't
      // reclaim these numbers while this gets manually investigated.
      const { error: extendError } = await supabase
        .from("reservas")
        .update({ expira_en: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
        .eq("id", reserva.reserva_id);

      console.error("[reserva] marcar_en_verificacion failed after retry", {
        reservaId: reserva.reserva_id,
        correo,
        cantidad,
        paqueteTipo,
        storagePath,
        error: verificacionError.message,
        extendExpiryError: extendError?.message,
      });

      return {
        status: "error",
        error: "Tu comprobante se subió pero hubo un problema al confirmarlo. Escríbenos por WhatsApp.",
      };
    }

    await sendComprobanteRecibidoEmail({ to: correo, nombre, cantidad });

    return { status: "success", cantidad };
  } catch (err) {
    console.error("[reserva] unexpected exception", {
      correo,
      cantidad,
      paqueteTipo,
      storagePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: "error", error: GENERIC_ERROR_MESSAGE };
  }
}
