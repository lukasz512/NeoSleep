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
  { templateKey: "informedConsent", locales: ["en", "pl", "mx"], label: "Patient Informed Consent (MAD)" },
  { templateKey: "gdprConsent.pl", locales: ["pl"], label: "Doctor Data Protection Consent — Poland (GDPR)" },
  { templateKey: "gdprConsent.mx", locales: ["mx"], label: "Doctor Data Protection Consent — Mexico (LFPDPPP)" },
  { templateKey: "__test", locales: ["en", "pl", "mx"], label: "TEST FIXTURE — never shown, never real content", hidden: true },
];

export function isKnownDocument(templateKey: string, locale: string): boolean {
  const entry = DOCUMENT_MANIFEST.find((e) => e.templateKey === templateKey);
  return entry !== undefined && (entry.locales as readonly string[]).includes(locale);
}
