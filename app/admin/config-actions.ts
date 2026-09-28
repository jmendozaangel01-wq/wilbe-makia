"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminContext, type AdminContext } from "@/lib/auth/admin-context";
import { validateRaffleConfigInput, type RaffleConfigErrors, type RaffleConfigInput } from "@/lib/raffle-config/validate";
import { isValidLogoUrl } from "@/lib/tenant/logo";
import { detectImageFormat } from "@/lib/storage/image-signature";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type RaffleConfigState =
  | { status: "idle" }
  | { status: "success"; values: RaffleConfigInput; logoUrl: string | null; qrUrl: string | null }
  | { status: "error"; error?: string; fieldErrors: RaffleConfigErrors; values: RaffleConfigInput };

const FIELDS: (keyof RaffleConfigInput)[] = [
  "raffleName",
  "precioPorNumero",
  "sorteoFecha",
  "nequiNumero",
  "nequiNombre",
  "numerosBendecidos",
];

const GENERIC_ERROR_MESSAGE = "No pudimos guardar los cambios. Intenta de nuevo en unos minutos.";
const NO_RAFFLE_ERROR_MESSAGE = "Esta organización no tiene una rifa activa.";

function readInput(formData: FormData): RaffleConfigInput {
  return Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? "")])) as unknown as RaffleConfigInput;
}

function rpcErrorMessage(fallback: string, err: { message?: string } | null): string {
  return err?.message || fallback;
}

type ImageUpload =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "uploaded"; url: string; path: string };

/**
 * Shared logo/QR upload path: both are optional public images in the same
 * 'logos' bucket (see 0015_raffle_config_update.sql), validated the same
 * way -- byte-signature format/Content-Type (never the client-supplied
 * File.name/File.type; this bucket is public, see the risk review this batch
 * followed up on) and a size cap. `pathPrefix` (e.g. "<orgId>/logo" vs
 * "<orgId>/qr") is what keeps the two kinds from colliding in the bucket.
 */
async function uploadPublicImage(
  supabase: ReturnType<typeof createAdminClient>,
  file: FormDataEntryValue | null,
  pathPrefix: string,
  invalidMessage: string
): Promise<ImageUpload> {
  if (!(file instanceof File) || file.size === 0) {
    return { kind: "none" };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { kind: "error", message: "El archivo no puede pesar más de 5 MB." };
  }

  const buffer = await file.arrayBuffer();
  const format = detectImageFormat(buffer);

  if (!format) {
    return { kind: "error", message: invalidMessage };
  }

  const path = `${pathPrefix}-${randomUUID()}.${format.extension}`;

  const { error: uploadError } = await supabase.storage
    .from("logos")
    .upload(path, buffer, { contentType: format.mimeType, upsert: false });

  if (uploadError) {
    console.error("[admin] image upload failed", { storagePath: path, error: uploadError.message });
    return { kind: "error", message: "No se pudo subir el archivo. Intenta de nuevo." };
  }

  const { data: publicUrlData } = supabase.storage.from("logos").getPublicUrl(path);

  if (!isValidLogoUrl(publicUrlData.publicUrl)) {
    // Defense in depth (lib/tenant/logo.ts's contract) -- should be
    // unreachable since the URL is server-constructed, never user-supplied.
    console.error("[admin] generated public URL failed isValidLogoUrl", { url: publicUrlData.publicUrl });
    await supabase.storage.from("logos").remove([path]);
    return { kind: "error", message: GENERIC_ERROR_MESSAGE };
  }

  return { kind: "uploaded", url: publicUrlData.publicUrl, path };
}

/**
 * Saves the tenant admin's raffle configuration form. Runs entirely through
 * the service-role client, like every other app/admin/actions.ts action --
 * requireAdminContext() (own-session, RLS-respecting client underneath) is
 * the authorization boundary; this function only ever touches the caller's
 * own organization/raffle from context, never a client-supplied id.
 *
 * The logo field is optional on every submit: when the browser sends no file
 * (or an empty one), p_logo_url is passed as null and actualizar_rifa()
 * (0015) leaves organizations.logo_url untouched, so saving other fields
 * never requires re-picking a logo.
 */
export async function updateRaffleConfig(_prev: RaffleConfigState, formData: FormData): Promise<RaffleConfigState> {
  const context: AdminContext = await requireAdminContext();
  const values = readInput(formData);

  if (!context.raffleId) {
    return { status: "error", error: NO_RAFFLE_ERROR_MESSAGE, fieldErrors: {}, values };
  }

  const supabase = createAdminClient();

  const [raffleResult, orgResult] = await Promise.all([
    supabase
      .from("raffles")
      .select("max_numero, qr_url")
      .eq("id", context.raffleId)
      .eq("organization_id", context.organizationId)
      .single(),
    supabase.from("organizations").select("logo_url").eq("id", context.organizationId).single(),
  ]);
  const { data: raffle, error: raffleError } = raffleResult;

  if (raffleError || !raffle) {
    console.error("[admin] raffle lookup failed before config update", { error: raffleError?.message });
    return { status: "error", error: GENERIC_ERROR_MESSAGE, fieldErrors: {}, values };
  }

  if (orgResult.error) {
    // Fail closed, matching raffleError above: a failed lookup is not the
    // same thing as "this org has no logo yet" -- treating it as such would
    // silently proceed on a wrong assumption instead of surfacing the error.
    console.error("[admin] organization lookup failed before config update", { error: orgResult.error.message });
    return { status: "error", error: GENERIC_ERROR_MESSAGE, fieldErrors: {}, values };
  }

  const { max_numero: maxNumero, qr_url: existingQrUrl } = raffle as { max_numero: number; qr_url: string | null };
  const existingLogoUrl = (orgResult.data as { logo_url: string | null } | null)?.logo_url ?? null;

  const validated = validateRaffleConfigInput(values, maxNumero);

  if (!validated.ok) {
    return { status: "error", fieldErrors: validated.errors, values };
  }

  const logoUpload = await uploadPublicImage(
    supabase,
    formData.get("logo"),
    `${context.organizationId}/logo`,
    "El logo debe ser una imagen (JPG, PNG o WebP)."
  );
  if (logoUpload.kind === "error") {
    return { status: "error", error: logoUpload.message, fieldErrors: {}, values };
  }

  const qrUpload = await uploadPublicImage(
    supabase,
    formData.get("qr"),
    `${context.organizationId}/qr`,
    "El QR debe ser una imagen (JPG, PNG o WebP)."
  );
  if (qrUpload.kind === "error") {
    if (logoUpload.kind === "uploaded") await supabase.storage.from("logos").remove([logoUpload.path]);
    return { status: "error", error: qrUpload.message, fieldErrors: {}, values };
  }

  // actualizar_rifa() only touches logo_url/qr_url when given a non-null
  // value, so an untouched field must pass null -- but the state this
  // function returns to the form is a DISPLAY value, which should keep
  // showing whatever is actually persisted (existing*Url) rather than
  // going blank just because this particular submit didn't re-upload it.
  const logoUrl = logoUpload.kind === "uploaded" ? logoUpload.url : existingLogoUrl;
  const qrUrl = qrUpload.kind === "uploaded" ? qrUpload.url : existingQrUrl;

  const v = validated.value;
  const { error } = await supabase.rpc("actualizar_rifa", {
    p_organization_id: context.organizationId,
    p_raffle_id: context.raffleId,
    p_nombre: v.raffleName,
    p_precio_por_numero: v.precioPorNumero,
    p_paquetes: v.paquetes,
    p_numeros_bendecidos: v.numerosBendecidos,
    p_sorteo_fecha: v.sorteoFecha,
    p_nequi_numero: v.nequiNumero,
    p_nequi_nombre: v.nequiNombre,
    p_logo_url: logoUpload.kind === "uploaded" ? logoUpload.url : null,
    p_qr_url: qrUpload.kind === "uploaded" ? qrUpload.url : null,
  });

  if (error) {
    // The uploads already succeeded -- clean up any orphaned file(s) since the
    // config save itself failed, matching app/actions.ts's rollback pattern
    // for the comprobante upload.
    const orphaned = [logoUpload, qrUpload]
      .filter((u): u is Extract<ImageUpload, { kind: "uploaded" }> => u.kind === "uploaded")
      .map((u) => u.path);
    if (orphaned.length > 0) await supabase.storage.from("logos").remove(orphaned);

    console.error("[admin] actualizar_rifa failed", { error: error.message });
    return { status: "error", error: rpcErrorMessage(GENERIC_ERROR_MESSAGE, error), fieldErrors: {}, values };
  }

  // app/admin/page.tsx hands the raffle's blessed numbers to the Reservas and
  // Numeros tabs as props; without this they would keep the previous list
  // until a manual reload.
  revalidatePath("/admin");

  return { status: "success", values, logoUrl, qrUrl };
}
