import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_DOCUMENTS_BUCKET } from "../env.js";
import { PartnerServiceError } from "../errors.js";

/**
 * Private-bucket Supabase Storage access for generated documents (signed
 * partner documents, patient documents) and the NeoSleep signatory's
 * signature image. PDFs themselves are rendered by services/documentRenderer.ts
 * (Puppeteer) — the earlier pdf-lib renderer was removed in NEO-51. The
 * service key never leaves the backend — the frontend only ever receives a
 * short-lived signed URL (see getPartnerDocumentSignedUrl), consistent with
 * "API server is the only trust boundary" (CLAUDE.md).
 */

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    // PartnerServiceError (an AppError), not a plain Error: callers run
    // inside withTenant(), which rewraps any non-AppError as an opaque
    // "Database error: withTenant" — hiding a storage/config problem behind
    // a DB message (NEO-36).
    throw new PartnerServiceError("supabase-storage", "not configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY");
  }
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  }
  return supabase;
}

export interface UploadedDocument {
  path: string;
  bucket: string;
}

/** Uploads a document (PDF or raw signature PNG) to the private bucket. Returns the storage path — not a public URL, the bucket is private. */
export async function uploadPartnerDocument(
  path: string,
  bytes: Uint8Array,
  contentType: string
): Promise<UploadedDocument> {
  const client = getSupabase();
  const { error } = await client.storage
    .from(SUPABASE_DOCUMENTS_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new PartnerServiceError("supabase-storage", `upload failed: ${error.message}`, error);
  return { path, bucket: SUPABASE_DOCUMENTS_BUCKET };
}

/**
 * Downloads a private object server-side — used to load the NeoSleep
 * signatory's signature PNG (NEO-51), which must never be exposed as a
 * public or signed URL: it only ever leaves the server embedded in a
 * token-gated document preview or a generated PDF.
 */
export async function downloadPartnerDocument(path: string): Promise<Uint8Array> {
  const client = getSupabase();
  const { data, error } = await client.storage.from(SUPABASE_DOCUMENTS_BUCKET).download(path);
  if (error || !data) throw new PartnerServiceError("supabase-storage", `download failed: ${error?.message ?? "unknown error"}`, error);
  return new Uint8Array(await data.arrayBuffer());
}

/** Removes an uploaded document — used to clean up when the DB row that should reference it couldn't be written. */
export async function deletePartnerDocument(path: string): Promise<void> {
  const client = getSupabase();
  const { error } = await client.storage.from(SUPABASE_DOCUMENTS_BUCKET).remove([path]);
  if (error) throw new PartnerServiceError("supabase-storage", `delete failed: ${error.message}`, error);
}

/** Short-lived signed URL for downloading a private document — the service key itself never reaches the frontend. */
export async function getPartnerDocumentSignedUrl(path: string, expiresInSeconds = 300): Promise<string> {
  const client = getSupabase();
  const { data, error } = await client.storage
    .from(SUPABASE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new PartnerServiceError("supabase-storage", `signed URL failed: ${error?.message ?? "unknown error"}`, error);
  return data.signedUrl;
}
