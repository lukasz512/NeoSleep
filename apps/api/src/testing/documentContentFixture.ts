import { withPlatform } from "../db/tenant.js";
import {
  getCurrentDocumentContentVersion,
  insertDocumentContentVersion,
  type DocumentContentVersionRow,
} from "../db/documentContent.js";

/**
 * Test support (NEO-184) — makes sure a real template (informedConsent,
 * historiaEndo, …) has a current content version, without ever stacking a
 * fixture on top of real content. platform.document_content_version is shared
 * by every tenant and the API suite runs against the dev Supabase project, so
 * a spec that inserted unconditionally replaced the consent text real patients
 * read and sign ("QA consent body." on pwa-dev, NEO-184).
 */
export async function ensureDocumentContent(
  templateKey: string,
  locale: string,
  seed: { contentHtml: string; changeNote: string; createdByUserId?: string }
): Promise<DocumentContentVersionRow> {
  return withPlatform(async (client) => {
    const current = await getCurrentDocumentContentVersion(client, templateKey, locale);
    if (current) return current;
    return insertDocumentContentVersion(client, {
      templateKey,
      locale,
      contentHtml: seed.contentHtml,
      createdByUserId: seed.createdByUserId ?? "00000000-0000-0000-0000-000000000000",
      createdByName: "QA fixture",
      createdByEmail: "qa-fixture@neosleepcare.com",
      createdByTenantSlug: "test",
      changeNote: seed.changeNote,
    });
  });
}
