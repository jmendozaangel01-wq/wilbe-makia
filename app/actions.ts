"use server";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendComprobanteRecibidoEmail } from "@/lib/email";
import { MAX_CUSTOM_QTY, MIN_CUSTOM_QTY, PAQUETES, type PaqueteTipo } from "@/lib/constants";

export type ReservationState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; cantidad: number };

const PACKAGE_QUANTITIES = Object.fromEntries(
  PAQUETES.map((p) => [p.tipo, p.qty])
) as Record<Exclude<PaqueteTipo, "custom">, number>;

interface ReservarNumerosRow {
  reserva_id: string;
  numeros_asignados: number[];
}

const MAX_COMPROBANTE_BYTES = 8 * 1024 * 1024;

const GENERIC_ERROR_MESSAGE =
  "Hubo un problema al procesar tu reserva. Por favor intenta de nuevo en unos minutos.";

const INVALID_IMAGE_MESSAGE = "El comprobante debe ser una imagen.";

/**
 * Inspects the first bytes of a file for known image format signatures.
 * The client-supplied MIME type (`File.type`) is trivially spoofable, so this
 * is the real gate before the file is stored.
 */
function hasValidImageSignature(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12) return false;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;

  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;

  // WebP: 'RIFF' .... 'WEBP'
  const asciiSlice = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (asciiSlice(0, 4) === "RIFF" && asciiSlice(8, 12) === "WEBP") return true;

  return false;
}

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

  const cantidadValida =
    paqueteTipo === "custom"
      ? Number.isInteger(cantidad) && cantidad >= MIN_CUSTOM_QTY && cantidad <= MAX_CUSTOM_QTY
      : PACKAGE_QUANTITIES[paqueteTipo] === cantidad;

  if (!cantidadValida) {
    return { status: "error", error: "La cantidad seleccionada no es válida." };
  }

  // Read the file bytes once and reuse them for both the signature check and
  // the upload, instead of letting the SDK read the File object twice.
  const comprobanteBuffer = await comprobante.arrayBuffer();

  if (!hasValidImageSignature(comprobanteBuffer)) {
    return { status: "error", error: INVALID_IMAGE_MESSAGE };
  }

  let storagePath: string | undefined;

  try {
    const supabase = createAdminClient();

    const extension = comprobante.name.split(".").pop() || "jpg";
    storagePath = `${randomUUID()}.${extension}`;

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

    const { data: reservaRows, error: reservaError } = await supabase.rpc("reservar_numeros", {
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
      console.error("[reserva] reservar_numeros failed", {
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
