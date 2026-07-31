/**
 * Shape shared by any partner that exposes a static resources library
 * (documents/videos), as OrthoApnea does at /api/resources. Not an auth or
 * session contract — each partner's login/session model is its own concern
 * (see partners/orthoapnea.ts) since it isn't known to be uniform yet.
 */
export interface PartnerResourceLanguageVariant {
  /** Partner's own language code (e.g. "es", "en", "de"), not one of our locale keys — used for the flag/language chip row, not for app i18n. */
  code: string;
  mediaUrl: string;
}

export interface PartnerResourceItem {
  id: string;
  partner: string;
  kind: "document" | "video";
  /** Resolved via app-locale fallback — the default the whole card/tile opens when a specific language chip isn't clicked. */
  title: string;
  description: string;
  /** Resolved via app-locale fallback — proxy URL, never the partner's raw origin. */
  mediaUrl: string;
  /** Every language this specific resource is actually available in — drives the language chip row. */
  languages: PartnerResourceLanguageVariant[];
  /** Human label, reproduced verbatim from the partner's own site — not translated by us. */
  category: string;
  subcategory: string | null;
  weight: number;
}
