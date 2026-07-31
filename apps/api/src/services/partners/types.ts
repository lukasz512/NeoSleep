/**
 * Shape shared by any partner that exposes a static resources library
 * (documents/videos), as OrthoApnea does at /api/resources. Not an auth or
 * session contract — each partner's login/session model is its own concern
 * (see partners/orthoapnea.ts) since it isn't known to be uniform yet.
 */
export interface PartnerResourceItem {
  id: string;
  partner: string;
  kind: "document" | "video";
  title: string;
  description: string;
  /** Absolute URL to proxy through this partner's media route — never the partner's raw origin. */
  mediaUrl: string;
  category: number;
  weight: number;
}
