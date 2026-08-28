"use server";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendComprobanteRecibidoEmail } from "@/lib/email";
import { MAX_CUSTOM_QTY, MIN_CUSTOM_QTY, type PaqueteTipo } from "@/lib/constants";

export type ReservationState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; cantidad: number };

const PACKAGE_QUANTITIES: Record<Exclude<PaqueteTipo, "custom">, number> = {
  paquete_65: 65,
  paquete_100: 100,
  paquete_120: 120,
};

interface ReservarNumerosRow {
  reserva_id: string;
  numeros_asignados: number[];
}

const MAX_COMPROBANTE_BYTES = 8 * 1024 * 1024;

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
    return { status: "error", error: "El comprobante debe ser una imagen." };
  }

  const cantidadValida =
    paqueteTipo === "custom"
      ? Number.isInteger(cantidad) && cantidad >= MIN_CUSTOM_QTY && cantidad <= MAX_CUSTOM_QTY
      : PACKAGE_QUANTITIES[paqueteTipo] === cantidad;

  if (!cantidadValida) {
    return { status: "error", error: "La cantidad seleccionada no es válida." };
  }

  const supabase = createAdminClient();

  const extension = comprobante.name.split(".").pop() || "jpg";
  const storagePath = `${randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("comprobantes")
    .upload(storagePath, comprobante, {
      contentType: comprobante.type,
      upsert: false,
    });

  if (uploadError) {
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
    await supabase.storage.from("comprobantes").remove([storagePath]);
    return {
      status: "error",
      error: "Se agotaron los números disponibles para esa cantidad, intenta con una cantidad menor.",
    };
  }

  const { error: verificacionError } = await supabase.rpc("marcar_en_verificacion", {
    p_reserva_id: reserva.reserva_id,
    p_comprobante_url: storagePath,
  });

  if (verificacionError) {
    return {
      status: "error",
      error: "Tu comprobante se subió pero hubo un problema al confirmarlo. Escríbenos por WhatsApp.",
    };
  }

  await sendComprobanteRecibidoEmail({ to: correo, nombre, cantidad });

  return { status: "success", cantidad };
}
