import { Router, type Request, type Response } from "express";
import {
  getEvents,
  getEventById,
  insertEvent,
  updateEvent,
  getFirstUserId,
  type GetEventsFilters,
} from "../db.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const eventsRouter = Router();

async function getRepIdOrFallback(req: Request): Promise<string | null> {
  const userId = (req.session as { user?: { id: string } })?.user?.id;
  if (userId?.trim()) return userId.trim();
  if (process.env.NODE_ENV !== "production") {
    return await getFirstUserId();
  }
  return null;
}

eventsRouter.get(
  "/api/events",
  asyncHandler(async (req: Request, res: Response) => {
    const start = typeof req.query.start === "string" ? req.query.start.trim() : undefined;
    const end = typeof req.query.end === "string" ? req.query.end.trim() : undefined;
    const region = typeof req.query.region === "string" ? req.query.region.trim() : undefined;
    const repId = await getRepIdOrFallback(req);

    const filters: GetEventsFilters = { start, end, region, repId };
    const { rows } = await getEvents(filters);

    const items = rows.map((e) => ({
      id: e.id,
      title: e.title ?? "",
      start_at: e.start_at instanceof Date ? e.start_at.toISOString() : e.start_at,
      end_at: e.end_at instanceof Date ? e.end_at.toISOString() : e.end_at,
      type: e.type,
      status: e.status,
      location: e.location ?? undefined,
      video_link: e.video_link ?? undefined,
      notes: e.notes ?? undefined,
      region: e.region ?? undefined,
      attendees: e.attendees ?? [],
    }));

    res.json({ items });
  })
);

eventsRouter.get(
  "/api/events/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) {
      res.status(400).json({ error: "Missing event id" });
      return;
    }
    const event = await getEventById(id);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json({
      id: event.id,
      title: event.title ?? "",
      start_at: event.start_at instanceof Date ? event.start_at.toISOString() : event.start_at,
      end_at: event.end_at instanceof Date ? event.end_at.toISOString() : event.end_at,
      type: event.type,
      status: event.status,
      location: event.location ?? undefined,
      video_link: event.video_link ?? undefined,
      notes: event.notes ?? undefined,
      region: event.region ?? undefined,
      attendees: event.attendees ?? [],
    });
  })
);

eventsRouter.post(
  "/api/events",
  asyncHandler(async (req: Request, res: Response) => {
    const repId = await getRepIdOrFallback(req);
    if (!repId) {
      res.status(401).json({ error: "Authentication required to create events" });
      return;
    }

    const body = req.body as {
      title?: string;
      start_at?: string;
      end_at?: string;
      type?: string;
      status?: string;
      location?: string;
      video_link?: string;
      notes?: string;
      region?: string;
      attendees?: { attendee_type: "hcp" | "hco" | "lead"; attendee_id: string; is_primary?: boolean }[];
    };

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const startAt = typeof body.start_at === "string" ? body.start_at.trim() : "";
    const endAt = typeof body.end_at === "string" ? body.end_at.trim() : "";
    const type = body.type === "video" ? "video" : "f2f";
    const status = ["scheduled", "completed", "cancelled", "no_show"].includes(body.status ?? "")
      ? (body.status as "scheduled" | "completed" | "cancelled" | "no_show")
      : "scheduled";

    if (!startAt || !endAt) {
      res.status(400).json({ error: "start_at and end_at are required" });
      return;
    }

    const event = await insertEvent({
      rep_id: repId!,
      title: title || null,
      start_at: startAt,
      end_at: endAt,
      type,
      status,
      location: typeof body.location === "string" ? body.location.trim() || null : null,
      video_link: typeof body.video_link === "string" ? body.video_link.trim() || null : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      region: typeof body.region === "string" ? body.region.trim() || "" : "",
      attendees: Array.isArray(body.attendees) ? body.attendees : [],
    });

    if (!event) {
      res.status(500).json({ error: "Failed to create event" });
      return;
    }

    res.status(201).json({
      id: event.id,
      title: event.title ?? "",
      start_at: event.start_at instanceof Date ? event.start_at.toISOString() : event.start_at,
      end_at: event.end_at instanceof Date ? event.end_at.toISOString() : event.end_at,
      type: event.type,
      status: event.status,
      attendees: event.attendees ?? [],
    });
  })
);

eventsRouter.patch(
  "/api/events/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    if (!id) {
      res.status(400).json({ error: "Missing event id" });
      return;
    }

    const body = req.body as {
      title?: string;
      start_at?: string;
      end_at?: string;
      type?: string;
      status?: string;
      location?: string;
      video_link?: string;
      notes?: string;
      region?: string;
      attendees?: { attendee_type: "hcp" | "hco" | "lead"; attendee_id: string; is_primary?: boolean }[];
    };

    const event = await updateEvent(id, {
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      start_at: typeof body.start_at === "string" ? body.start_at.trim() : undefined,
      end_at: typeof body.end_at === "string" ? body.end_at.trim() : undefined,
      type: body.type === "video" ? "video" : body.type === "f2f" ? "f2f" : undefined,
      status: ["scheduled", "completed", "cancelled", "no_show"].includes(body.status ?? "")
        ? (body.status as "scheduled" | "completed" | "cancelled" | "no_show")
        : undefined,
      location: typeof body.location === "string" ? body.location.trim() : undefined,
      video_link: typeof body.video_link === "string" ? body.video_link.trim() : undefined,
      notes: typeof body.notes === "string" ? body.notes.trim() : undefined,
      region: typeof body.region === "string" ? body.region.trim() : undefined,
      attendees: Array.isArray(body.attendees) ? body.attendees : undefined,
    });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json({
      id: event.id,
      title: event.title ?? "",
      start_at: event.start_at instanceof Date ? event.start_at.toISOString() : event.start_at,
      end_at: event.end_at instanceof Date ? event.end_at.toISOString() : event.end_at,
      type: event.type,
      status: event.status,
      attendees: event.attendees ?? [],
    });
  })
);
