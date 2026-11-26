/** Largest accepted drawn signature (a PNG data URL) — a finger signature on a phone is ~10-60 KB. */
export const MAX_SIGNATURE_DATA_URL_LENGTH = 400_000;

const SIGNATURE_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/** A drawn signature from SignaturePad.vue: a PNG data URL within the size cap. */
export function isSignatureDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_SIGNATURE_DATA_URL_LENGTH && SIGNATURE_DATA_URL_RE.test(value);
}
