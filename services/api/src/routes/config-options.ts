import { Router, type Request, type Response } from "express";
import {
  getConfigOptions,
  insertConfigOption,
  updateConfigOption,
  deleteConfigOption,
  type ConfigOptionType,
} from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const configOptionsRouter = Router();

const ALLOWED_TYPES: ConfigOptionType[] = ["region", "specialty", "institution_type"];

function requireAdminOrDev(req: Request, res: Response): boolean {
  const session = req.session as { user?: { role?: string } } | undefined;
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "manager";
  const devBypass = process.env.NODE_ENV !== "production" && !session?.user;
  if (!isAdmin && !devBypass) {
    res.status(403).json({ error: "Admin or manager only" });
    return false;
  }
  return true;
}

/** GET /api/config/options – all dropdown options for the current tenant (public, no auth required). */
configOptionsRouter.get(
  "/api/config/options",
  asyncHandler(async (_req: Request, res: Response) => {
    const options = await getConfigOptions();
    res.json(options);
  })
);

/** POST /api/config/options – add a new option (admin/manager only). */
configOptionsRouter.post(
  "/api/config/options",
  asyncHandler(async (req: Request, res: Response) => {
    if (!requireAdminOrDev(req, res)) return;

    const body = req.body as { type?: unknown; value?: unknown; label?: unknown; sort_order?: unknown };
    const type = body.type;
    const value = typeof body.value === "string" ? body.value.trim() : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const sort_order = typeof body.sort_order === "number" ? body.sort_order : 0;

    if (!ALLOWED_TYPES.includes(type as ConfigOptionType)) {
      res.status(400).json({ error: `type must be one of: ${ALLOWED_TYPES.join(", ")}` });
      return;
    }
    if (!value) {
      res.status(400).json({ error: "value is required" });
      return;
    }
    if (!label) {
      res.status(400).json({ error: "label is required" });
      return;
    }

    const option = await insertConfigOption({ type: type as ConfigOptionType, value, label, sort_order });
    if (!option) {
      res.status(409).json({ error: "Option with this value already exists" });
      return;
    }
    res.status(201).json(option);
  })
);

/** PATCH /api/config/options/:id – update label or sort_order (admin/manager only). */
configOptionsRouter.patch(
  "/api/config/options/:id",
  asyncHandler(async (req: Request, res: Response) => {
    if (!requireAdminOrDev(req, res)) return;

    const id = req.params.id?.trim();
    if (!id) {
      res.status(400).json({ error: "Missing option id" });
      return;
    }

    const body = req.body as { label?: unknown; sort_order?: unknown };
    const updated = await updateConfigOption(id, {
      label: typeof body.label === "string" ? body.label : undefined,
      sort_order: typeof body.sort_order === "number" ? body.sort_order : undefined,
    });

    if (!updated) {
      res.status(404).json({ error: "Option not found" });
      return;
    }
    res.json(updated);
  })
);

/** DELETE /api/config/options/:id – remove an option (admin/manager only). */
configOptionsRouter.delete(
  "/api/config/options/:id",
  asyncHandler(async (req: Request, res: Response) => {
    if (!requireAdminOrDev(req, res)) return;

    const id = req.params.id?.trim();
    if (!id) {
      res.status(400).json({ error: "Missing option id" });
      return;
    }

    const deleted = await deleteConfigOption(id);
    if (!deleted) {
      res.status(404).json({ error: "Option not found" });
      return;
    }
    res.status(204).end();
  })
);
