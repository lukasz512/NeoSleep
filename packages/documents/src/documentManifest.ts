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
}

export const DOCUMENT_MANIFEST: readonly DocumentManifestEntry[] = [
  { templateKey: "informedConsent", locales: ["en", "pl", "mx"], label: "Patient Informed Consent (MAD)" },
  { templateKey: "gdprConsent.pl", locales: ["pl"], label: "Doctor Data Protection Consent — Poland (GDPR)" },
  { templateKey: "gdprConsent.mx", locales: ["mx"], label: "Doctor Data Protection Consent — Mexico (LFPDPPP)" },
];

export function isKnownDocument(templateKey: string, locale: string): boolean {
  const entry = DOCUMENT_MANIFEST.find((e) => e.templateKey === templateKey);
  return entry !== undefined && (entry.locales as readonly string[]).includes(locale);
}
