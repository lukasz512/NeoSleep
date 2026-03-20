import { Router, type Request, type Response } from "express";
import { getClientsPaginated, getClientById, insertClient, updateClient } from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { parsePaginationParams, toFilterArray, requireDb } from "./utils.js";
import { requireAuth } from "../middleware/requireAuth.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const clientsRouter = Router();

clientsRouter.get(
  "/api/clients",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, sortBy, sortOrder } = parsePaginationParams(req);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const { rows, total } = await getClientsPaginated(
      {
        search: search || undefined,
        status: toFilterArray(req.query.status)[0],
        region: toFilterArray(req.query.region)[0],
      },
      page, limit, sortBy, sortOrder
    );
    res.json({ items: rows, total });
  })
);

clientsRouter.get(
  "/api/clients/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) { res.status(400).json({ error: "Missing client id" }); return; }
    const client = await getClientById(id);
    if (!client) { res.status(404).json({ error: "Client not found" }); return; }
    res.json(client);
  })
);

clientsRouter.post(
  "/api/clients",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as {
      salutation?: string; first_name?: string; last_name?: string;
      email?: string; phone?: string; reason?: string; referred_by?: string;
      hcp_id?: string; status?: string; region?: string; country?: string; notes?: string;
    };
    const first_name = typeof body.first_name === "string" ? body.first_name.trim() : "";
    const last_name = typeof body.last_name === "string" ? body.last_name.trim() : "";
    if (!first_name || !last_name) {
      res.status(400).json({ error: "first_name and last_name are required" });
      return;
    }
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    if (email && !EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }
    if (!requireDb(res)) return;
    const client = await insertClient({
      salutation: typeof body.salutation === "string" ? body.salutation.trim() || undefined : undefined,
      first_name,
      last_name,
      email,
      phone: typeof body.phone === "string" ? body.phone.trim() || undefined : undefined,
      reason: typeof body.reason === "string" ? body.reason.trim() || undefined : undefined,
      referred_by: typeof body.referred_by === "string" ? body.referred_by.trim() || undefined : undefined,
      hcp_id: typeof body.hcp_id === "string" ? body.hcp_id.trim() || undefined : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      region: typeof body.region === "string" ? body.region : undefined,
      country: typeof body.country === "string" ? body.country.trim() || undefined : undefined,
      notes: typeof body.notes === "string" ? body.notes.trim() || undefined : undefined,
    });
    if (!client) { res.status(500).json({ error: "Failed to create client" }); return; }
    res.status(201).json(client);
  })
);

clientsRouter.patch(
  "/api/clients/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) { res.status(400).json({ error: "Missing client id" }); return; }
    const body = req.body as {
      salutation?: string; first_name?: string; last_name?: string;
      email?: string; phone?: string; reason?: string; referred_by?: string;
      hcp_id?: string; status?: string; region?: string; country?: string; notes?: string;
    };
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    if (email !== undefined && email !== "" && !EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }
    if (!requireDb(res)) return;
    const client = await updateClient(id, {
      salutation: body.salutation !== undefined ? (body.salutation || undefined) : undefined,
      first_name: typeof body.first_name === "string" ? body.first_name.trim() || undefined : undefined,
      last_name: typeof body.last_name === "string" ? body.last_name.trim() || undefined : undefined,
      email: body.email !== undefined ? body.email : undefined,
      phone: body.phone !== undefined ? body.phone : undefined,
      reason: body.reason !== undefined ? body.reason : undefined,
      referred_by: body.referred_by !== undefined ? body.referred_by : undefined,
      hcp_id: body.hcp_id !== undefined ? body.hcp_id : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      region: typeof body.region === "string" ? body.region : undefined,
      country: body.country !== undefined ? body.country : undefined,
      notes: body.notes !== undefined ? body.notes : undefined,
    });
    if (!client) { res.status(404).json({ error: "Client not found" }); return; }
    res.json(client);
  })
);
