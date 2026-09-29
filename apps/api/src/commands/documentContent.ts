import sanitizeHtml from "sanitize-html";
import type { TenantContext } from "../context/TenantContext.js";
import { insertAuditLog } from "../db.js";
import { withPlatform } from "../db/tenant.js";
import { insertDocumentContentVersion, type DocumentContentVersionRow } from "../db/documentContent.js";
import {
  setEntityTypesForTemplate,
  setPatientChecklistConfig,
  CHECKLIST_FILL_MODES,
  DOCUMENT_TEMPLATE_ENTITY_TYPES,
  type ChecklistFillMode,
  type DocumentTemplateEntityType,
} from "../db/documentTemplateEntityType.js";
import { isKnownDocument, DOCUMENT_MANIFEST, SUPPORTED_LOCALES } from "@neo/documents";
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

/**
 * "Permissions" tab — which entity types (lead/patient/practitioner/
 * organization) a template applies to. Full-replace semantics (matches
 * db/documentTemplateEntityType.ts's delete-then-insert), same two-separate-
 * transactions trade-off as SaveDocumentContentVersionCommand above: the
 * platform-schema write and the audit_log write are not atomic together.
 */
export async function SetDocumentTemplateEntityTypesCommand(
  ctx: TenantContext,
  templateKey: string,
  entityTypes: string[]
): Promise<string[]> {
  const key = templateKey?.trim();
  if (!key) throw new ValidationError("templateKey is required");
  // No !entry.hidden filter: matches isKnownDocument()'s own validation scope
  // (SaveDocumentContentVersionCommand's manifest check above) — "hidden"
  // only means "excluded from the real admin picker list"
  // (GetDocumentContentIndexQuery), not "an invalid template key." The
  // hidden "__test" fixture must stay assignable so this command's own test
  // suite can exercise it without touching a real document.
  if (!DOCUMENT_MANIFEST.some((entry) => entry.templateKey === key)) {
    throw new ValidationError(`Unknown document template: "${key}"`);
  }

  const unique = [...new Set(entityTypes)];
  for (const entityType of unique) {
    if (!DOCUMENT_TEMPLATE_ENTITY_TYPES.includes(entityType as DocumentTemplateEntityType)) {
      throw new ValidationError(`Invalid entity type: "${entityType}"`);
    }
  }

  await withPlatform((platformClient) => setEntityTypesForTemplate(platformClient, key, unique, ctx.user.id));

  // No entity_id here (unlike SaveDocumentContentVersionCommand's version.id):
  // document_template_entity_type has no synthetic row id, only the
  // (template_key, entity_type) composite key, and template_key is never a
  // UUID — insertAuditLog silently nulls out any non-UUID entity_id
  // (db/audit-log.ts's own isValidEntityUuid check), so passing the
  // templateKey there would just as silently produce an unqueryable-by-id
  // row. template_key is recoverable from entity_after instead.
  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "update",
    entity_type: "DocumentTemplateEntityType",
    entity_after: { template_key: key, entity_types: unique },
    request_id: ctx.requestId,
  });

  return unique;
}

/**
 * Patient Estudios checklist config (migration 031, ADR-024): who fills a
 * patient document (consent / patient / doctor / external) and its
 * position in the checklist. Only for templates already assigned to the
 * patient entity type — assign first on the same Permissions tab.
 */
export async function SetPatientChecklistConfigCommand(
  ctx: TenantContext,
  templateKey: string,
  input: { fillMode?: unknown; sortOrder?: unknown }
): Promise<{ fillMode: ChecklistFillMode; sortOrder: number }> {
  const key = templateKey?.trim();
  if (!key || !DOCUMENT_MANIFEST.some((entry) => entry.templateKey === key)) {
    throw new ValidationError(`Unknown document template: "${key}"`);
  }
  const { fillMode, sortOrder } = input;
  if (typeof fillMode !== "string" || !CHECKLIST_FILL_MODES.includes(fillMode as ChecklistFillMode)) {
    throw new ValidationError(`fillMode must be one of ${CHECKLIST_FILL_MODES.join(", ")}`);
  }
  if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999) {
    throw new ValidationError("sortOrder must be an integer between 0 and 999");
  }

  const updated = await withPlatform((platformClient) =>
    setPatientChecklistConfig(platformClient, key, fillMode as ChecklistFillMode, sortOrder)
  );
  if (!updated) throw new ValidationError(`"${key}" isn't assigned to patients — assign it first`);

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "update",
    entity_type: "PatientChecklistConfig",
    entity_after: { template_key: key, fill_mode: fillMode, sort_order: sortOrder },
    request_id: ctx.requestId,
  });

  return { fillMode: fillMode as ChecklistFillMode, sortOrder };
}
