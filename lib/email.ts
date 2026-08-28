import "server-only";
import { Resend } from "resend";

interface SendComprobanteRecibidoParams {
  to: string;
  nombre: string;
  cantidad: number;
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
      from: "Wilber Makia <onboarding@resend.dev>",
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
