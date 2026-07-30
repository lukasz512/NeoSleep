import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_DOCUMENTS_BUCKET } from "../env.js";

/**
 * Generates the signed GDPR/partner-agreement PDFs produced at doctor-invite
 * acceptance and stores them in Supabase Storage (private bucket). The
 * service key never leaves the backend — the frontend only ever receives a
 * short-lived signed URL (see getPartnerDocumentSignedUrl), consistent with
 * "API server is the only trust boundary" (CLAUDE.md).
 */

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase Storage not configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY");
  }
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  }
  return supabase;
}

const PAGE_WIDTH = 595.28; // A4 pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

export interface SignedDocumentInput {
  title: string;
  bodyText: string;
  signerName: string;
  signedAt: Date;
  /** "data:image/png;base64,...." from SignaturePad.vue's toDataURL(). */
  signatureDataUrl: string;
}

/** Renders a signed document (title + body + signature block) as a PDF, paginating as needed. */
export async function renderSignedDocumentPdf(input: SignedDocumentInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  page.drawText(input.title, { x: MARGIN, y, size: 16, font: bold });
  y -= 30;

  for (const line of wrapText(input.bodyText, font, 11, maxWidth)) {
    if (y < MARGIN + 20) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    page.drawText(line, { x: MARGIN, y, size: 11, font });
    y -= 16;
  }

  // Signature block always starts fresh if it wouldn't otherwise fit whole.
  const SIGNATURE_BLOCK_HEIGHT = 140;
  if (y < MARGIN + SIGNATURE_BLOCK_HEIGHT) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }
  y -= 20;
  page.drawText(`Podpisano przez: ${input.signerName}`, { x: MARGIN, y, size: 11, font });
  y -= 18;
  page.drawText(`Data: ${input.signedAt.toISOString()}`, { x: MARGIN, y, size: 11, font });
  y -= 14;

  const pngMatch = /^data:image\/png;base64,(.+)$/.exec(input.signatureDataUrl);
  if (pngMatch) {
    const pngBytes = Buffer.from(pngMatch[1]!, "base64");
    const pngImage = await pdf.embedPng(pngBytes);
    const sigWidth = 200;
    const sigHeight = (pngImage.height / pngImage.width) * sigWidth;
    y -= sigHeight;
    page.drawImage(pngImage, { x: MARGIN, y, width: sigWidth, height: sigHeight });
  }

  return pdf.save();
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
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
  return { path, bucket: SUPABASE_DOCUMENTS_BUCKET };
}

/** Short-lived signed URL for downloading a private document — the service key itself never reaches the frontend. */
export async function getPartnerDocumentSignedUrl(path: string, expiresInSeconds = 300): Promise<string> {
  const client = getSupabase();
  const { data, error } = await client.storage
    .from(SUPABASE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(`Supabase Storage signed URL failed: ${error?.message ?? "unknown error"}`);
  return data.signedUrl;
}
