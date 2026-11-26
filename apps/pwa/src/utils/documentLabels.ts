/**
 * Maps a @neo/documents templateKey (e.g. "gdprConsent.pl") to its i18n
 * label key (e.g. "user.document-content.labels.gdprConsentPl") — mirrors the
 * dot-stripping convention @neo/documents' own i18n keys already use for
 * this same templateKey shape (see packages/i18n/*.json's
 * "documents.gdprConsentPl.*" keys), so a "." in a templateKey never has
 * to survive into a vue-i18n key segment.
 *
 * The returned key may not exist yet for a document type DOCUMENT_MANIFEST
 * just grew to include, before a matching i18n key is added — callers
 * should check the result against t() and fall back to the API's own raw
 * `label` field when it comes back unresolved (see DocumentsView.vue's
 * documentLabel()), so the picker never shows a blank/broken row.
 */
export function documentLabelKey(templateKey: string): string | null {
  if (!templateKey) return null;
  const segment = templateKey.replace(/\.(\w)/g, (_match, char: string) => char.toUpperCase());
  return `user.document-content.labels.${segment}`;
}
