import { Router, type Router as RouterType, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { problemReportLimiter } from "../middleware/rateLimiter.js";
import {
  DIAGNOSTIC_STATUSES,
  PROBLEM_REPORT_KINDS,
  PROBLEM_REPORT_STATUSES,
  getProblemReportAttachmentPath,
  insertProblemReport,
  isPlatformAdmin,
  listDiagnostics,
  listProblemReports,
  setDiagnosticStatus,
  setProblemReportAttachment,
  tenantSlugFromHost,
  updateProblemReport,
  type DiagnosticStatus,
  type ProblemReportKind,
  type ProblemReportStatus,
} from "../db.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { getPartnerDocumentSignedUrl, uploadPartnerDocument } from "../services/partnerDocuments.js";
import { pwaBaseUrl } from "../services/issueNotifications.js";
import { sendContactEmail } from "../mailer.js";
import { routeParam } from "./utils.js";

/**
 * "Report a problem" (every signed-in user) and the admin Issues view.
 * Thin waiters; SQL lives in db/problemReport.ts. Reports and errors live in
 * the platform schema, so every admin read is scoped to the caller's tenant
 * here, and the errors endpoints additionally need a platform admin.
 */

export const problemReportRouter: RouterType = Router();

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MIN_DESCRIPTION = 10;
const MAX_DESCRIPTION = 5000;
const MAX_REQUEST_IDS = 20;
const MAX_REQUEST_ID_LENGTH = 128;
const MAX_RECENT_ERRORS = 10;
const MAX_RECENT_ERRORS_BYTES = 20 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

/** Runs multer for multipart bodies and reports its failures as a 400 instead of a 500. */
function parseOptionalFile(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      next(new ValidationError(err.code === "LIMIT_FILE_SIZE" ? "file is larger than 5 MB" : `invalid upload: ${err.message}`, "file"));
      return;
    }
    next(err);
  });
}

function field(body: unknown, name: string): unknown {
  return body && typeof body === "object" ? (body as Record<string, unknown>)[name] : undefined;
}

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Accepts a real JSON value (JSON body) or a JSON string (multipart text field). */
function jsonField(value: unknown, name: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ValidationError(`${name} must be valid JSON`, name);
  }
}

function parseRequestIds(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  const parsed = jsonField(value, "request_ids");
  if (!Array.isArray(parsed)) throw new ValidationError("request_ids must be an array of strings", "request_ids");
  const ids = parsed.map((v) => {
    if (typeof v !== "string" || !v.trim() || v.length > MAX_REQUEST_ID_LENGTH) {
      throw new ValidationError("request_ids must be non-empty strings of at most 128 characters", "request_ids");
    }
    return v.trim();
  });
  return [...new Set(ids)].slice(0, MAX_REQUEST_IDS);
}

function parseRecentErrors(value: unknown): unknown[] | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = jsonField(value, "recent_errors");
  if (!Array.isArray(parsed)) throw new ValidationError("recent_errors must be an array", "recent_errors");
  const items = parsed.slice(-MAX_RECENT_ERRORS);
  for (const item of items) {
    const isFlatObject =
      item !== null &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      Object.values(item as Record<string, unknown>).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v));
    if (!isFlatObject) throw new ValidationError("recent_errors must be objects of plain values", "recent_errors");
  }
  if (Buffer.byteLength(JSON.stringify(items)) > MAX_RECENT_ERRORS_BYTES) {
    throw new ValidationError("recent_errors is too large", "recent_errors");
  }
  return items;
}

/** Path only: no query string, no fragment (they can carry ids and tokens). */
function stripPageUrl(value: unknown): string | null {
  const text = optionalText(value, 1000);
  if (!text) return null;
  return text.split("#")[0]!.split("?")[0]!.slice(0, 500) || null;
}

function sanitiseFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-100);
  return cleaned || "attachment";
}

function parseStatusFilter<T extends string>(value: unknown, allowed: readonly T[], label: string): T | null {
  if (value === undefined || value === "" || value === "all") return null;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`${label} must be one of: ${allowed.join(", ")}, all`, "status");
  }
  return value as T;
}

function requireUuid(req: Request, resource: string): string {
  const id = routeParam(req, "id")?.trim() ?? "";
  if (!UUID_RE.test(id)) throw new NotFoundError(resource, id);
  return id;
}

async function requirePlatformAdmin(req: Request): Promise<void> {
  if (!(await isPlatformAdmin(req.user?.email))) throw new ForbiddenError("Platform admin only");
}

// ---------------------------------------------------------------------------
// POST /api/v1/problem-reports — any signed-in user (multipart with optional "file", or JSON)
// ---------------------------------------------------------------------------
problemReportRouter.post(
  "/problem-reports",
  requireAuth,
  problemReportLimiter,
  parseOptionalFile,
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;
    const kindRaw = field(req.body, "kind");
    const kind: ProblemReportKind =
      kindRaw === undefined || kindRaw === "" ? "problem" : (PROBLEM_REPORT_KINDS as readonly unknown[]).includes(kindRaw) ? (kindRaw as ProblemReportKind) : (() => {
        throw new ValidationError(`kind must be one of: ${PROBLEM_REPORT_KINDS.join(", ")}`, "kind");
      })();

    const description = typeof field(req.body, "description") === "string" ? (field(req.body, "description") as string).trim() : "";
    if (description.length < MIN_DESCRIPTION || description.length > MAX_DESCRIPTION) {
      throw new ValidationError(`description must be ${MIN_DESCRIPTION}-${MAX_DESCRIPTION} characters`, "description");
    }

    const file = req.file;
    if (file && !(file.mimetype.startsWith("image/") || file.mimetype === "application/pdf")) {
      throw new ValidationError("file must be an image or a PDF", "file");
    }

    const slug = tenantSlugFromHost(req.hostname);
    const env = process.env.NODE_ENV ?? "development";
    const reportId = randomUUID();
    const { number } = await insertProblemReport(reportId, {
      tenant_slug: slug,
      env,
      kind,
      description,
      reporter_user_id: user.sub,
      reporter_name: user.name ?? null,
      reporter_email: user.email ?? null,
      reporter_role: user.role,
      page_url: stripPageUrl(field(req.body, "page_url")),
      app_version: optionalText(field(req.body, "app_version"), 100),
      user_agent: optionalText(req.headers["user-agent"], 500),
      viewport: optionalText(field(req.body, "viewport"), 50),
      request_ids: parseRequestIds(field(req.body, "request_ids")),
      recent_errors: parseRecentErrors(field(req.body, "recent_errors")),
    });

    let hasAttachment = false;
    if (file) {
      const name = sanitiseFilename(file.originalname);
      const path = `problem-reports/${slug}/${reportId}/${name}`;
      try {
        await uploadPartnerDocument(path, new Uint8Array(file.buffer), file.mimetype);
        await setProblemReportAttachment(reportId, { path, name, mime: file.mimetype, size: file.size });
        hasAttachment = true;
      } catch (err) {
        // The report matters more than its attachment: keep it, say nothing to the user, log for us.
        console.error(`problem report #${number}: attachment upload failed:`, err);
      }
    }

    // The description may contain patient data, so the email carries metadata only.
    sendContactEmail(`[NeoSleep ${env}] Report #${number} (${kind})`, [
      ["Tenant", slug],
      ["Reporter", `${user.name ?? user.email} (${user.role})`],
      ["Page", stripPageUrl(field(req.body, "page_url")) ?? "-"],
      ["App version", optionalText(field(req.body, "app_version"), 100) ?? "-"],
      ["Attachment", hasAttachment ? "yes" : "no"],
      ["Open", `${pwaBaseUrl()}/issues?report=${reportId}`],
    ]).catch((err) => console.error("problem report email failed:", err));

    res.status(201).json({ id: reportId, number });
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/admin/issues/access — does this admin also see the Errors tab?
// ---------------------------------------------------------------------------
problemReportRouter.get(
  "/admin/issues/access",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ platformAdmin: await isPlatformAdmin(req.user?.email) });
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/admin/problem-reports?status= — this tenant's reports, newest first
// ---------------------------------------------------------------------------
problemReportRouter.get(
  "/admin/problem-reports",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const status = parseStatusFilter<ProblemReportStatus>(req.query.status, PROBLEM_REPORT_STATUSES, "status");
    const items = await listProblemReports(tenantSlugFromHost(req.hostname), status);
    res.json({ items });
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/admin/problem-reports/:id — status and/or admin note
// ---------------------------------------------------------------------------
problemReportRouter.patch(
  "/admin/problem-reports/:id",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = requireUuid(req, "ProblemReport");
    const statusRaw = field(req.body, "status");
    const noteRaw = field(req.body, "admin_note");
    if (statusRaw === undefined && noteRaw === undefined) throw new ValidationError("status or admin_note is required");
    if (statusRaw !== undefined && !(PROBLEM_REPORT_STATUSES as readonly unknown[]).includes(statusRaw)) {
      throw new ValidationError(`status must be one of: ${PROBLEM_REPORT_STATUSES.join(", ")}`, "status");
    }
    if (noteRaw !== undefined && noteRaw !== null && (typeof noteRaw !== "string" || noteRaw.length > 5000)) {
      throw new ValidationError("admin_note must be text of at most 5000 characters", "admin_note");
    }
    const row = await updateProblemReport(tenantSlugFromHost(req.hostname), id, {
      status: statusRaw as ProblemReportStatus | undefined,
      admin_note: noteRaw === undefined ? undefined : typeof noteRaw === "string" ? noteRaw.trim() || null : null,
    });
    if (!row) throw new NotFoundError("ProblemReport", id);
    res.json(row);
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/admin/problem-reports/:id/attachment — 5-minute signed URL
// ---------------------------------------------------------------------------
problemReportRouter.get(
  "/admin/problem-reports/:id/attachment",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = requireUuid(req, "ProblemReport");
    const path = await getProblemReportAttachmentPath(tenantSlugFromHost(req.hostname), id);
    if (!path) throw new NotFoundError("ProblemReportAttachment", id);
    res.json({ url: await getPartnerDocumentSignedUrl(path, 300) });
  })
);

// ---------------------------------------------------------------------------
// GET /api/v1/admin/diagnostics?status=open&env=&level= — grouped errors (platform admin)
// ---------------------------------------------------------------------------
problemReportRouter.get(
  "/admin/diagnostics",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    await requirePlatformAdmin(req);
    const statusQuery = req.query.status === undefined || req.query.status === "" ? "open" : req.query.status;
    const status = parseStatusFilter<DiagnosticStatus>(statusQuery, DIAGNOSTIC_STATUSES, "status");
    const env = optionalText(req.query.env, 50);
    const level = optionalText(req.query.level, 20);
    const items = await listDiagnostics({ status, env, level });
    res.json({ items });
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/admin/diagnostics/:id — open / resolved / dismissed (platform admin)
// ---------------------------------------------------------------------------
problemReportRouter.patch(
  "/admin/diagnostics/:id",
  requireRole("admin"),
  asyncHandler(async (req: Request, res: Response) => {
    await requirePlatformAdmin(req);
    const id = requireUuid(req, "Diagnostic");
    const status = field(req.body, "status");
    if (!(DIAGNOSTIC_STATUSES as readonly unknown[]).includes(status)) {
      throw new ValidationError(`status must be one of: ${DIAGNOSTIC_STATUSES.join(", ")}`, "status");
    }
    const row = await setDiagnosticStatus(id, status as DiagnosticStatus);
    if (!row) throw new NotFoundError("Diagnostic", id);
    res.json(row);
  })
);
