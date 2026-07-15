import type { TenantContext } from "../context/TenantContext.js";
import {
  insertPresentation,
  updatePresentation,
  getPresentationById,
  type InsertPresentationInput,
  type UpdatePresentationInput,
  type Presentation,
} from "../db.js";
import { insertAuditLog } from "../db.js";
import { ValidationError } from "../errors.js";

/**
 * COMMANDS — Presentation domain.
 *
 * Each command:
 *   1. Validates input
 *   2. Executes the DB write via ctx.client (tenant-scoped, same transaction as audit)
 *   3. Writes to audit_log (GDPR Art. 30 compliance)
 *   4. Returns the result
 *
 * Commands never touch `req` or `res`. Independently testable.
 */

// DB CHECK constraint presentation_status_check — see infrastructure/db/schema-snapshot.sql.
const PRESENTATION_STATUSES = ["active", "archived", "draft"] as const;

// Basic URL-shape check — mirrors OrganizationForm's website validator leniency
// level (apps/pwa/src/composables/useOrganizationForm.ts's WEBSITE_REGEX):
// optional scheme, a host with at least one dot, optional path/query/fragment.
// Not a full RFC 3986 validator, just enough to catch an obvious typo before
// the value ends up as an <iframe>/<img> src in PresentationViewer.vue.
const FILE_URL_REGEX = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

function normalizeStatus(input: string | undefined): string {
  if (input === undefined) return "active";
  const v = input.trim().toLowerCase();
  if (!PRESENTATION_STATUSES.includes(v as (typeof PRESENTATION_STATUSES)[number])) {
    throw new ValidationError(`Invalid presentation status: "${input}"`);
  }
  return v;
}

function normalizeStringArray(input: string[] | undefined): string[] | undefined {
  if (input === undefined) return undefined;
  return input.map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// CREATE PRESENTATION
// ---------------------------------------------------------------------------

export interface CreatePresentationInput {
  title: string;
  file_url: string;
  thumbnail_url?: string | null;
  locale?: string;
  keywords?: string[];
  tags?: string[];
  status?: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Creates a new Presentation.
 *
 * `uploaded_by` is always taken from ctx.user.id — it must never be read from
 * the request body, otherwise a client could claim a different uploader.
 * `product_id` is always null — there is no GET /api/v1/product endpoint yet,
 * so nothing in the input can be resolved to a real product id.
 */
export async function CreatePresentationCommand(
  ctx: TenantContext,
  input: CreatePresentationInput
): Promise<Presentation> {
  const title = input.title?.trim() ?? "";
  if (!title) throw new ValidationError("title is required");

  const fileUrl = input.file_url?.trim() ?? "";
  if (!fileUrl) throw new ValidationError("file_url is required");
  if (!FILE_URL_REGEX.test(fileUrl)) throw new ValidationError("Invalid file_url format");

  const status = normalizeStatus(input.status);

  const insertInput: InsertPresentationInput = {
    title,
    product_id:    null,
    uploaded_by:   ctx.user.id,
    file_url:      fileUrl,
    thumbnail_url: input.thumbnail_url?.trim() || null,
    locale:        input.locale?.trim() || "en",
    keywords:      normalizeStringArray(input.keywords) ?? [],
    tags:          normalizeStringArray(input.tags) ?? [],
    status,
    metadata:      input.metadata ?? null,
  };

  const presentation = await insertPresentation(ctx.client, insertInput);

  await insertAuditLog(ctx.client, {
    user_id:      ctx.user.id,
    action:       "create",
    entity_type:  "Presentation",
    entity_id:    presentation.id,
    entity_after: {
      id:     presentation.id,
      title:  presentation.title,
      status: presentation.status,
      locale: presentation.locale,
    },
    request_id: ctx.requestId,
  });

  return presentation;
}

// ---------------------------------------------------------------------------
// UPDATE PRESENTATION
// ---------------------------------------------------------------------------

export interface UpdatePresentationPayload {
  title?: string;
  file_url?: string;
  thumbnail_url?: string | null;
  locale?: string;
  keywords?: string[];
  tags?: string[];
  status?: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Updates a Presentation. Returns null if the presentation does not exist.
 * `uploaded_by`/`product_id` cannot be changed via this command — see
 * updatePresentation()'s doc comment in db/presentation.ts.
 */
export async function UpdatePresentationCommand(
  ctx: TenantContext,
  id: string,
  input: UpdatePresentationPayload
): Promise<Presentation | null> {
  if (!id?.trim()) throw new ValidationError("presentation id is required");

  const before = await getPresentationById(ctx.client, id);
  if (!before) return null;

  let title: string | undefined;
  if (input.title !== undefined) {
    title = input.title.trim();
    if (!title) throw new ValidationError("title cannot be blank");
  }

  let fileUrl: string | undefined;
  if (input.file_url !== undefined) {
    fileUrl = input.file_url.trim();
    if (!fileUrl) throw new ValidationError("file_url cannot be blank");
    if (!FILE_URL_REGEX.test(fileUrl)) throw new ValidationError("Invalid file_url format");
  }

  const updateInput: UpdatePresentationInput = {
    title,
    file_url:      fileUrl,
    thumbnail_url: input.thumbnail_url,
    locale:        input.locale,
    keywords:      normalizeStringArray(input.keywords),
    tags:          normalizeStringArray(input.tags),
    status:        input.status !== undefined ? normalizeStatus(input.status) : undefined,
    metadata:      input.metadata,
  };

  const after = await updatePresentation(ctx.client, id, updateInput);
  if (!after) return null;

  await insertAuditLog(ctx.client, {
    user_id:       ctx.user.id,
    action:        "update",
    entity_type:   "Presentation",
    entity_id:     id,
    entity_before: { title: before.title, status: before.status, locale: before.locale },
    entity_after:  { title: after.title,  status: after.status,  locale: after.locale },
    request_id:    ctx.requestId,
  });

  return after;
}
