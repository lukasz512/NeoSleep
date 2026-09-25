import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/requireRole.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { buildContext } from "../context/TenantContext.js";
import { SaveDocumentContentVersionCommand, SetDocumentTemplateEntityTypesCommand, SetPatientChecklistConfigCommand } from "../commands/documentContent.js";
import {
  GetDocumentContentIndexQuery,
  GetCurrentDocumentContentQuery,
  ListDocumentContentVersionsQuery,
  GetDocumentContentVersionByIdQuery,
  GetDocumentTemplateEntityTypesQuery,
  GetPatientChecklistConfigQuery,
} from "../queries/documentContent.js";
import { ValidationError } from "../errors.js";
import { routeParam } from "./utils.js";

/**
 * Document-content routes — thin waiters, same shape as routes/users.ts.
 * Admin/manager only, throughout (requireRole("admin","manager"), the
 * exact reuse target confirmed in docs/stories/document-content-editor.md).
 *
 * Every route still goes through withTenant()+buildContext() even the
 * read-only ones whose query functions don't take a TenantContext — that
 * pair is also where the live token_version check happens (see
 * TenantContext.ts's own comment), which every authenticated route needs
 * regardless of whether the data it reads is tenant-scoped or platform-scoped.
 */
export const documentContentRouter: RouterType = Router();

documentContentRouter.get(
  "/document-content",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      await buildContext(req, client, slug);
      return GetDocumentContentIndexQuery();
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// "Permissions" tab — which entity types a template applies to. Registered
// BEFORE the generic GET/:templateKey/:locale route below: Express matches
// routes in registration order, and ":locale" is a wildcard param that would
// otherwise also match a request for "…/__test/entity-types" (locale="entity-types"),
// silently routing it into GetCurrentDocumentContentQuery instead — this bit
// once already, caught by the route-level integration test.
// ---------------------------------------------------------------------------
documentContentRouter.get(
  "/document-content/:templateKey/entity-types",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const templateKey = routeParam(req, "templateKey") ?? "";
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      await buildContext(req, client, slug);
      return GetDocumentTemplateEntityTypesQuery(templateKey);
    });
    res.json(result);
  })
);

documentContentRouter.put(
  "/document-content/:templateKey/entity-types",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const templateKey = routeParam(req, "templateKey") ?? "";
    const entityTypes = Array.isArray(req.body?.entityTypes)
      ? req.body.entityTypes.filter((v: unknown): v is string => typeof v === "string")
      : undefined;
    if (!entityTypes) throw new ValidationError("entityTypes must be an array of strings");

    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return SetDocumentTemplateEntityTypesCommand(ctx, templateKey, entityTypes);
    });
    res.json(result);
  })
);

// Patient Estudios checklist config (who fills it, position) — also before
// the ":locale" wildcard below, same reason as entity-types above.
documentContentRouter.get(
  "/document-content/:templateKey/patient-checklist",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const templateKey = routeParam(req, "templateKey") ?? "";
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      await buildContext(req, client, slug);
      return GetPatientChecklistConfigQuery(templateKey);
    });
    res.json(result);
  })
);

documentContentRouter.put(
  "/document-content/:templateKey/patient-checklist",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const templateKey = routeParam(req, "templateKey") ?? "";
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return SetPatientChecklistConfigCommand(ctx, templateKey, (req.body ?? {}) as { fillMode?: unknown; sortOrder?: unknown });
    });
    res.json(result);
  })
);

documentContentRouter.get(
  "/document-content/:templateKey/:locale",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const templateKey = routeParam(req, "templateKey") ?? "";
    const locale = routeParam(req, "locale") ?? "";
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      await buildContext(req, client, slug);
      return GetCurrentDocumentContentQuery(templateKey, locale);
    });
    res.json(result);
  })
);

documentContentRouter.get(
  "/document-content/:templateKey/:locale/versions",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const templateKey = routeParam(req, "templateKey") ?? "";
    const locale = routeParam(req, "locale") ?? "";
    const cursor = typeof req.query.cursor === "string" ? Number.parseInt(req.query.cursor, 10) : undefined;
    const limit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined;
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      await buildContext(req, client, slug);
      return ListDocumentContentVersionsQuery(templateKey, locale, { cursor, limit });
    });
    res.json(result);
  })
);

documentContentRouter.get(
  "/document-content/:templateKey/:locale/versions/:versionId",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const versionId = routeParam(req, "versionId") ?? "";
    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      await buildContext(req, client, slug);
      return GetDocumentContentVersionByIdQuery(versionId);
    });
    res.json(result);
  })
);

documentContentRouter.post(
  "/document-content/:templateKey/:locale",
  requireRole("admin", "manager"),
  asyncHandler(async (req: Request, res: Response) => {
    const templateKey = routeParam(req, "templateKey") ?? "";
    const locale = routeParam(req, "locale") ?? "";
    const contentHtml = typeof req.body?.contentHtml === "string" ? req.body.contentHtml : undefined;
    if (!contentHtml) throw new ValidationError("contentHtml is required");
    const changeNote = typeof req.body?.changeNote === "string" ? req.body.changeNote : null;

    const slug = tenantSlugFromHost(req.hostname);
    const result = await withTenant(slug, async (client) => {
      const ctx = await buildContext(req, client, slug);
      return SaveDocumentContentVersionCommand(ctx, { templateKey, locale, contentHtml, changeNote });
    });
    res.json(result);
  })
);
