import sanitizeHtml from "sanitize-html";
import type { TenantContext } from "../context/TenantContext.js";
import { insertAuditLog } from "../db.js";
import { withPlatform } from "../db/tenant.js";
import { insertDocumentContentVersion, type DocumentContentVersionRow } from "../db/documentContent.js";
import { isKnownDocument, SUPPORTED_LOCALES } from "@neo/documents";
import { ValidationError } from "../errors.js";

/**
 * COMMANDS — admin/manager document-content editor (see
 * docs/stories/document-content-editor.md).
 *
 * Unlike every other command in this codebase, this one needs TWO DB
 * handles: ctx.client (tenant-scoped, for the audit_log write — audit_log
 * lives per-tenant) and a separate platform-schema transaction opened here
 * via withPlatform() (the actual content write — platform.document_content_version
 * is cross-tenant, see the migration's own comment for why). Flagged
 * trade-off, not an oversight: these are two separate transactions, so if
 * ctx.client's transaction rolled back after the platform write already
 * committed, the gap is a missing audit_log entry for that edit — never a
 * missing/incorrect content version, which is the thing with real
 * compliance weight here. audit_log is supplementary, not authoritative,
 * elsewhere in this codebase too (see insertAuditLog's own "non-throwing,
 * errors never propagate" doc comment) — acceptable now, a candidate for
 * the explicitly-planned later refactor pass if it ever proves to matter.
 */

/**
 * Real HTML parser re-serialization (not regex) — its allowlisted-tags-only
 * output is always well-formed/balanced, which is what actually closes the
 * "unbalanced <!-- or unclosed tag silently swallows/restructures every-
 * thing physically after it" bug class already hit once this session (see
 * packages/documents/templates/informedConsent.html's own header comment).
 * By the time content reaches here, a protected {legalEntityName}-style
 * token has already been serialized back to plain literal text by the
 * WYSIWYG editor (see the frontend's protectedTokenExtension) — it's just
 * ordinary allowed text content, no special-casing needed for it here.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "u", "ul", "ol", "li"],
  allowedAttributes: {},
  disallowedTagsMode: "discard",
};

export function sanitizeDocumentContentHtml(rawHtml: string): string {
  return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}

export interface SaveDocumentContentVersionInput {
  templateKey: string;
  locale: string;
  contentHtml: string;
  changeNote?: string | null;
}

export async function SaveDocumentContentVersionCommand(
  ctx: TenantContext,
  input: SaveDocumentContentVersionInput
): Promise<DocumentContentVersionRow> {
  const templateKey = input.templateKey?.trim();
  if (!templateKey) throw new ValidationError("templateKey is required");

  const locale = input.locale?.trim();
  if (!locale || !SUPPORTED_LOCALES.includes(locale as (typeof SUPPORTED_LOCALES)[number])) {
    throw new ValidationError(`Unsupported locale: "${input.locale}"`);
  }

  if (!isKnownDocument(templateKey, locale)) {
    throw new ValidationError(`Unknown document: "${templateKey}" has no "${locale}" variant`);
  }

  const contentHtml = sanitizeDocumentContentHtml(input.contentHtml ?? "");
  if (!contentHtml.trim()) throw new ValidationError("contentHtml must not be empty after sanitization");

  const version = await withPlatform((platformClient) =>
    insertDocumentContentVersion(platformClient, {
      templateKey,
      locale,
      contentHtml,
      createdByUserId: ctx.user.id,
      createdByName: ctx.user.name ?? ctx.user.email,
      createdByEmail: ctx.user.email,
      createdByTenantSlug: ctx.slug,
      changeNote: input.changeNote ?? null,
    })
  );

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "update",
    entity_type: "DocumentContentVersion",
    entity_id: version.id,
    entity_after: { template_key: templateKey, locale, version_number: version.version_number },
    request_id: ctx.requestId,
  });

  return version;
}
