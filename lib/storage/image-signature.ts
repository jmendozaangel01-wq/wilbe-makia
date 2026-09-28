export type ImageFormat = { extension: "jpg" | "png" | "webp"; mimeType: "image/jpeg" | "image/png" | "image/webp" };

/**
 * Inspects the first bytes of a file for known image format signatures and
 * returns the detected format, or null if none matched. The client-supplied
 * MIME type and filename (`File.type`, `File.name`) are trivially spoofable,
 * so this is the only trustworthy source for both the accept/reject decision
 * and, for storage paths that are publicly readable, the extension and
 * Content-Type actually persisted -- shared by the buyer's payment receipt
 * upload (app/actions.ts) and the tenant admin's raffle logo upload
 * (app/admin/config-actions.ts).
 */
export function detectImageFormat(buffer: ArrayBuffer): ImageFormat | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }

  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { extension: "png", mimeType: "image/png" };
  }

  // WebP: 'RIFF' .... 'WEBP'
  const asciiSlice = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (asciiSlice(0, 4) === "RIFF" && asciiSlice(8, 12) === "WEBP") {
    return { extension: "webp", mimeType: "image/webp" };
  }

  return null;
}

export function hasValidImageSignature(buffer: ArrayBuffer): boolean {
  return detectImageFormat(buffer) !== null;
}
