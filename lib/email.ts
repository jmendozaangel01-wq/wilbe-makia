import "server-only";
import { Resend } from "resend";
import { formatNumero } from "./constants";

interface SendComprobanteRecibidoParams {
  to: string;
  nombre: string;
  cantidad: number;
}

interface SendNumerosConfirmadosParams {
  to: string;
  nombre: string;
  numeros: number[];
}

interface SendReservaRechazadaParams {
  to: string;
  nombre: string;
}

/**
 * Sends the "comprobante recibido" confirmation email.
 * No-ops with a warning when RESEND_API_KEY isn't configured yet, so the
 * reservation flow keeps working end-to-end before Resend is set up.
 */
export async function sendComprobanteRecibidoEmail({
  to,
  nombre,
  cantidad,
}: SendComprobanteRecibidoParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("RESEND_API_KEY no configurada — se omite el envío del correo de confirmación.");
    return;
  }

  const resend = new Resend(apiKey);

  try {
    await resend.emails.send({
      from: "Wilber Makia <rifa@ciento80grados.com>",
      to,
      subject: "Comprobante recibido — en verificación",
      text: [
        `Hola ${nombre},`,
        "",
        `Recibimos tu comprobante de pago para ${cantidad} números de la rifa de la XTZ 660.`,
        "Estamos verificando tu pago y te avisaremos a este correo apenas tus números queden confirmados.",
        "",
        "Gracias por participar.",
        "Wilber Makia",
      ].join("\n"),
    });
  } catch (err) {
    console.warn("No se pudo enviar el correo de confirmación:", err);
  }
}

/**
 * Sends the final "números confirmados" email once the admin approves payment.
 * No-ops with a warning when RESEND_API_KEY isn't configured yet, matching
 * sendComprobanteRecibidoEmail above.
 */
export async function sendNumerosConfirmadosEmail({
  to,
  nombre,
  numeros,
}: SendNumerosConfirmadosParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("RESEND_API_KEY no configurada — se omite el envío del correo de números confirmados.");
    return;
  }

  const resend = new Resend(apiKey);

  try {
    await resend.emails.send({
      from: "Wilber Makia <rifa@ciento80grados.com>",
      to,
      subject: "¡Tus números están confirmados!",
      text: [
        `Hola ${nombre},`,
        "",
        "Tu pago quedó confirmado. Estos son tus números para la rifa de la XTZ 660:",
        "",
        numeros.map(formatNumero).join(", "),
        "",
        "Guarda este correo — el sorteo se hace en vivo y estos números son los que participan.",
        "",
        "Gracias por participar.",
        "Wilber Makia",
      ].join("\n"),
    });
  } catch (err) {
    console.warn("No se pudo enviar el correo de números confirmados:", err);
  }
}

/**
 * Sends the "no pudimos confirmar tu pago" email once the admin rejects a
 * reservation. No-ops with a warning when RESEND_API_KEY isn't configured
 * yet, matching the other functions above.
 */
export async function sendReservaRechazadaEmail({ to, nombre }: SendReservaRechazadaParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("RESEND_API_KEY no configurada — se omite el envío del correo de rechazo.");
    return;
  }

  const resend = new Resend(apiKey);

  try {
    await resend.emails.send({
      from: "Wilber Makia <rifa@ciento80grados.com>",
      to,
      subject: "No pudimos confirmar tu pago",
      text: [
        `Hola ${nombre},`,
        "",
        "Lamentablemente detectamos inconsistencias con tu comprobante de pago y no pudimos confirmar tu reserva para la rifa de la XTZ 660.",
        "Los números que tenías apartados quedaron liberados.",
        "",
        "Si crees que esto es un error, responde este mismo correo y te ayudamos a revisarlo.",
        "",
        "Gracias por tu comprensión.",
        "Wilber Makia",
      ].join("\n"),
    });
  } catch (err) {
    console.warn("No se pudo enviar el correo de rechazo:", err);
  }
}
