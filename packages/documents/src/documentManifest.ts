import type { Locale } from "./documentI18n.js";

/**
 * The known set of generated documents — DB-free, static, source of truth
 * for both the admin "Documents" content-editor's picker list and the
 * backend's template_key validation (see docs/stories/document-content-editor.md).
 * Adding a new document type is: a new templates/<key>.html file + an entry
 * here — no schema change, since platform.document_content_version.template_key
 * is a free string, not a CHECK-constrained enum, specifically so this list
 * can grow without a migration.
 */
export interface DocumentManifestEntry {
  /** Matches a templates/<templateKey>.html filename (minus extension). */
  templateKey: string;
  /** Which locale variants exist for this template — e.g. gdprConsent.pl only ever renders as "pl", never "mx". */
  locales: readonly Locale[];
  /** Human-readable label for the admin picker UI. */
  label: string;
  /**
   * Document reference code printed top-right on page 1 and in the per-page
   * footer (filled into templates via {{doc:ref}}). Partner documents get a
   * jurisdiction + content-version code computed by apps/api instead
   * (partnerDocuments.ts), which overrides this one via the doc_ref data field.
   */
  refCode: string;
  /**
   * True only for the test-fixture entry below. isKnownDocument() still
   * validates against it (so integration tests can exercise the real
   * save/read command+route path end-to-end without touching a real
   * document's rows — platform.document_content_version isn't
   * tenant-isolated the way the rest of this test DB is, see
   * apps/api/src/commands/documentContent.spec.ts's own comment), but a
   * hidden entry must never appear in the real admin picker list — see
   * GetDocumentContentIndexQuery's own filter.
   */
  hidden?: boolean;
}

export const DOCUMENT_MANIFEST: readonly DocumentManifestEntry[] = [
  { templateKey: "informedConsent", locales: ["en", "pl", "mx"], label: "Patient Informed Consent (MAD)", refCode: "NSL-CI-DAM v1" },
  // NEO-51: partner onboarding documents. Locale == jurisdiction (pl = Poland,
  // mx = Mexico). partnerAgreement + partnerDpa render as ONE signed PDF
  // (the DPA is the agreement's Annex 1, see templates/partnerAgreement.html).
  { templateKey: "partnerAgreement", locales: ["pl", "mx"], label: "Partner Collaboration Agreement", refCode: "NSL-PA v1" },
  { templateKey: "partnerDpa", locales: ["pl", "mx"], label: "Partner Agreement — Annex 1: Data Processing Agreement", refCode: "NSL-PA v1" },
  { templateKey: "partnerPrivacyNotice", locales: ["pl", "mx"], label: "Partner Privacy Notice", refCode: "NSL-PN v1" },
  // Superseded by partnerPrivacyNotice (NEO-51) — hidden from the editor's
  // picker, kept so already-signed historical records still resolve.
  { templateKey: "gdprConsent.pl", locales: ["pl"], label: "Doctor Data Protection Consent — Poland (GDPR)", refCode: "NSL-GDPR-PL v1", hidden: true },
  { templateKey: "gdprConsent.mx", locales: ["mx"], label: "Doctor Data Protection Consent — Mexico (LFPDPPP)", refCode: "NSL-LFPDPPP-MX v1", hidden: true },
  { templateKey: "historiaEndo", locales: ["en", "mx"], label: "Historia Endo — Root Canal Informed Consent", refCode: "NSL-HE v1" },
  { templateKey: "stopBang", locales: ["en", "mx"], label: "STOP-Bang OSA Screening", refCode: "NSL-SB v1" },
  { templateKey: "medicalHistory", locales: ["en", "mx"], label: "Antecedentes médicos — Patient Medical History", refCode: "NSL-AM v1" },
  { templateKey: "oralExam", locales: ["en", "mx"], label: "Exploración de cavidad oral — Oral Exam", refCode: "NSL-ECO v1" },
  { templateKey: "__test", locales: ["en", "pl", "mx"], label: "TEST FIXTURE — never shown, never real content", refCode: "NSL-TEST v1", hidden: true },
];

export function isKnownDocument(templateKey: string, locale: string): boolean {
  const entry = DOCUMENT_MANIFEST.find((e) => e.templateKey === templateKey);
  return entry !== undefined && (entry.locales as readonly string[]).includes(locale);
}

/** Reference code for a template (see DocumentManifestEntry.refCode); "" for an unknown key. */
export function getDocumentRefCode(templateKey: string): string {
  return DOCUMENT_MANIFEST.find((e) => e.templateKey === templateKey)?.refCode ?? "";
}
