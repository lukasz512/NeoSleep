import { withPlatform } from "../db/tenant.js";
import {
  getCurrentDocumentContentVersion,
  listDocumentContentVersions,
  getDocumentContentVersionById,
  type DocumentContentVersionRow,
  type ListDocumentContentVersionsOptions,
} from "../db/documentContent.js";
import { getEntityTypesForTemplate } from "../db/documentTemplateEntityType.js";
import { DOCUMENT_MANIFEST } from "@neo/documents";
import { NotFoundError } from "../errors.js";

/**
 * QUERIES — admin/manager document-content editor (see
 * docs/stories/document-content-editor.md). Reads platform.document_content_version
 * via withPlatform() (platform schema, not tenant-scoped — see
 * commands/documentContent.ts's own comment for why two DB handles are
 * needed for this feature). ctx (TenantContext) isn't threaded through these
 * — nothing here is tenant-scoped data, callers pass it only for RBAC at
 * the route layer, same as any other admin/manager-gated read.
 */

export interface DocumentContentIndexEntry {
  templateKey: string;
  locale: string;
  label: string;
  hasContent: boolean;
  currentVersionNumber: number | null;
  updatedAt: string | null;
}

/** One row per manifest (templateKey, locale) pair, so a template with no content yet still shows up (for the admin to create its first version). Excludes hidden (test-fixture-only) manifest entries — see documentManifest.ts's own comment. */
export async function GetDocumentContentIndexQuery(): Promise<DocumentContentIndexEntry[]> {
  const pairs = DOCUMENT_MANIFEST.filter((entry) => !entry.hidden).flatMap((entry) =>
    entry.locales.map((locale) => ({ entry, locale }))
  );

  return withPlatform(async (client) => {
    const entries: DocumentContentIndexEntry[] = [];
    for (const { entry, locale } of pairs) {
      const current = await getCurrentDocumentContentVersion(client, entry.templateKey, locale);
      entries.push({
        templateKey: entry.templateKey,
        locale,
        label: entry.label,
        hasContent: current !== null,
        currentVersionNumber: current?.version_number ?? null,
        updatedAt: current?.created_at?.toISOString() ?? null,
      });
    }
    return entries;
  });
}

/** Throws NotFoundError rather than returning null — a missing consent paragraph is a compliance risk, not a cosmetic 404 an admin editor UI should silently paper over. */
export async function GetCurrentDocumentContentQuery(
  templateKey: string,
  locale: string
): Promise<DocumentContentVersionRow> {
  const version = await withPlatform((client) => getCurrentDocumentContentVersion(client, templateKey, locale));
  if (!version) throw new NotFoundError("Document content", `${templateKey}/${locale}`);
  return version;
}

export async function ListDocumentContentVersionsQuery(
  templateKey: string,
  locale: string,
  options: ListDocumentContentVersionsOptions = {}
): Promise<DocumentContentVersionRow[]> {
  return withPlatform((client) => listDocumentContentVersions(client, templateKey, locale, options));
}

export async function GetDocumentContentVersionByIdQuery(id: string): Promise<DocumentContentVersionRow> {
  const version = await withPlatform((client) => getDocumentContentVersionById(client, id));
  if (!version) throw new NotFoundError("Document content version", id);
  return version;
}

/** Permissions tab — current entity-type assignment for a template. Empty array if never assigned, not an error. */
export async function GetDocumentTemplateEntityTypesQuery(templateKey: string): Promise<string[]> {
  return withPlatform((client) => getEntityTypesForTemplate(client, templateKey));
}
