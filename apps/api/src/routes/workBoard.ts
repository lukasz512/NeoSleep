import { Router, type Router as RouterType, type Request, type Response, type NextFunction } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  WORK_LINK_KINDS,
  WORK_STATUSES,
  addWorkItemComment,
  createWorkItem,
  getWorkItem,
  isPlatformAdmin,
  listWorkItemEvents,
  listWorkItems,
  listWorkTeams,
  parseWorkItemKey,
  updateWorkItem,
  workTeamExists,
  type WorkActor,
  type WorkItemPatch,
  type WorkItemRow,
  type WorkLink,
  type WorkLinkKind,
  type WorkStatus,
} from "../db.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { routeParam } from "./utils.js";

/**
 * Platform work board (CORE-177, docs/stories/platform-work-board.md): the kanban that
 * replaces Linear. Two kinds of caller:
 *  - a platform admin (platform.users owner/admin), signed in as usual: may do anything;
 *  - the nightly agent, with `X-Agent-Token` (its SHA-256 is WORK_BOARD_AGENT_TOKEN_SHA256):
 *    never sees Triage, may comment, add links, set the branch and make only the moves in
 *    AGENT_MOVES. Approving a spec and closing work stay human (segregation of duties).
 * Tenant users get 403; the board holds no tenant or patient data.
 */

export const workBoardRouter: RouterType = Router();

export const AGENT_TOKEN_HEADER = "x-agent-token";

/** The only status moves the agent may make: spec written, build started, build finished or given back. */
export const AGENT_MOVES: Readonly<Partial<Record<WorkStatus, readonly WorkStatus[]>>> = {
  to_spec: ["spec_ready"],
  approved: ["building"],
  building: ["needs_review", "approved"],
};

const AGENT_FIELDS = new Set(["status", "add_links", "branch"]);
const MAX_TITLE = 200;
const MAX_BODY = 5000;
const MAX_COMMENT = 5000;
const MAX_LINKS = 20;
const MAX_LABELS = 10;

function agentTokenMatches(token: string): boolean {
  const expected = process.env.WORK_BOARD_AGENT_TOKEN_SHA256?.trim().toLowerCase();
  if (!expected || !/^[0-9a-f]{64}$/.test(expected)) return false;
  const actual = createHash("sha256").update(token).digest();
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

/** Sets res.locals.actor, or answers 401/403. */
function requireBoardActor(req: Request, res: Response, next: NextFunction): void {
  const agentToken = req.header(AGENT_TOKEN_HEADER);
  if (agentToken !== undefined) {
    if (!agentTokenMatches(agentToken)) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    res.locals.actor = { name: "agent", kind: "agent" } satisfies WorkActor;
    next();
    return;
  }
  requireAuth(req, res, () => {
    isPlatformAdmin(req.user?.email)
      .then((ok) => {
        if (!ok) throw new ForbiddenError("Platform admin only");
        res.locals.actor = { name: req.user!.email ?? req.user!.sub, kind: "human" } satisfies WorkActor;
        next();
      })
      .catch(next);
  });
}

workBoardRouter.use("/platform/work", requireBoardActor);

function actorOf(res: Response): WorkActor {
  return res.locals.actor as WorkActor;
}

function field(body: unknown, name: string): unknown {
  return body && typeof body === "object" ? (body as Record<string, unknown>)[name] : undefined;
}

function hasField(body: unknown, name: string): boolean {
  return !!body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, name);
}

function requiredTitle(value: unknown): string {
  const title = typeof value === "string" ? value.trim() : "";
  if (!title) throw new ValidationError("title is required", "title");
  if (title.length > MAX_TITLE) throw new ValidationError(`title is longer than ${MAX_TITLE} characters`, "title");
  return title;
}

function optionalBody(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new ValidationError(`${name} must be text`, name);
  if (value.length > MAX_BODY) throw new ValidationError(`${name} is longer than ${MAX_BODY} characters`, name);
  return value.trim() || null;
}

function statusValue(value: unknown): WorkStatus {
  if (typeof value !== "string" || !(WORK_STATUSES as readonly string[]).includes(value)) {
    throw new ValidationError("unknown status", "status");
  }
  return value as WorkStatus;
}

function priorityValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 4) {
    throw new ValidationError("priority must be 0-4", "priority");
  }
  return value;
}

function labelsValue(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_LABELS || value.some((l) => typeof l !== "string" || !l.trim() || l.length > 40)) {
    throw new ValidationError(`labels must be up to ${MAX_LABELS} short texts`, "labels");
  }
  return [...new Set((value as string[]).map((l) => l.trim()))];
}

function linksValue(value: unknown): WorkLink[] {
  if (!Array.isArray(value) || value.length > MAX_LINKS) throw new ValidationError(`links must be a list of up to ${MAX_LINKS}`, "links");
  return value.map((raw) => {
    const kind = field(raw, "kind");
    const url = field(raw, "url");
    const title = field(raw, "title");
    if (typeof kind !== "string" || !(WORK_LINK_KINDS as readonly string[]).includes(kind)) {
      throw new ValidationError("unknown link kind", "links");
    }
    if (typeof url !== "string" || !/^https:\/\/\S{3,2000}$/.test(url)) throw new ValidationError("links must be https URLs", "links");
    const link: WorkLink = { kind: kind as WorkLinkKind, url };
    if (typeof title === "string" && title.trim()) link.title = title.trim().slice(0, 200);
    return link;
  });
}

function itemKey(req: Request): { team: string; number: number } {
  const raw = routeParam(req, "key") ?? "";
  const parsed = parseWorkItemKey(raw);
  if (!parsed) throw new NotFoundError("Work item", raw);
  return parsed;
}

/** The agent never sees Triage: an untriaged item is answered as not found. */
function hideTriageFromAgent(actor: WorkActor, item: WorkItemRow | null, key: string): WorkItemRow {
  if (!item || (actor.kind === "agent" && item.status === "triage")) throw new NotFoundError("Work item", key);
  return item;
}

// GET /api/v1/platform/work/teams
workBoardRouter.get(
  "/platform/work/teams",
  asyncHandler(async (_req, res) => {
    res.json({ items: await listWorkTeams() });
  })
);

// GET /api/v1/platform/work/items?team=CORE&status=to_spec,approved
workBoardRouter.get(
  "/platform/work/items",
  asyncHandler(async (req, res) => {
    const team = typeof req.query.team === "string" && req.query.team ? req.query.team.toUpperCase() : null;
    let statuses: WorkStatus[] | null =
      typeof req.query.status === "string" && req.query.status ? req.query.status.split(",").map(statusValue) : null;
    if (actorOf(res).kind === "agent") statuses = (statuses ?? [...WORK_STATUSES]).filter((s) => s !== "triage");
    res.json({ items: await listWorkItems({ team, statuses }) });
  })
);

// GET /api/v1/platform/work/items/CORE-12 — the item and its event trail
workBoardRouter.get(
  "/platform/work/items/:key",
  asyncHandler(async (req, res) => {
    const { team, number } = itemKey(req);
    const item = hideTriageFromAgent(actorOf(res), await getWorkItem(team, number), `${team}-${number}`);
    res.json({ item, events: await listWorkItemEvents(item.id) });
  })
);

// POST /api/v1/platform/work/items — human only; the agent works on existing items.
workBoardRouter.post(
  "/platform/work/items",
  asyncHandler(async (req, res) => {
    const actor = actorOf(res);
    if (actor.kind === "agent") throw new ForbiddenError("The agent cannot create work items");
    const team = typeof field(req.body, "team") === "string" ? (field(req.body, "team") as string).toUpperCase() : "";
    if (!(await workTeamExists(team))) throw new ValidationError("unknown team", "team");
    const item = await createWorkItem(
      {
        team,
        title: requiredTitle(field(req.body, "title")),
        problem: hasField(req.body, "problem") ? optionalBody(field(req.body, "problem"), "problem") : null,
        change: hasField(req.body, "change") ? optionalBody(field(req.body, "change"), "change") : null,
        done_when: hasField(req.body, "done_when") ? optionalBody(field(req.body, "done_when"), "done_when") : null,
        status: hasField(req.body, "status") ? statusValue(field(req.body, "status")) : "backlog",
        priority: hasField(req.body, "priority") ? priorityValue(field(req.body, "priority")) : 0,
        labels: hasField(req.body, "labels") ? labelsValue(field(req.body, "labels")) : [],
        links: hasField(req.body, "links") ? linksValue(field(req.body, "links")) : [],
      },
      actor
    );
    res.status(201).json({ item });
  })
);

// PATCH /api/v1/platform/work/items/CORE-12
workBoardRouter.patch(
  "/platform/work/items/:key",
  asyncHandler(async (req, res) => {
    const actor = actorOf(res);
    const { team, number } = itemKey(req);
    const body = req.body as Record<string, unknown>;
    if (actor.kind === "agent") {
      const forbidden = Object.keys(body).filter((k) => !AGENT_FIELDS.has(k));
      if (forbidden.length) throw new ForbiddenError(`The agent cannot change ${forbidden.join(", ")}`);
    }

    const patch: WorkItemPatch = {};
    if (hasField(body, "title")) patch.title = requiredTitle(body.title);
    if (hasField(body, "problem")) patch.problem = optionalBody(body.problem, "problem");
    if (hasField(body, "change")) patch.change = optionalBody(body.change, "change");
    if (hasField(body, "done_when")) patch.done_when = optionalBody(body.done_when, "done_when");
    if (hasField(body, "priority")) patch.priority = priorityValue(body.priority);
    if (hasField(body, "labels")) patch.labels = labelsValue(body.labels);
    if (hasField(body, "branch")) {
      if (body.branch !== null && (typeof body.branch !== "string" || !/^[\w./-]{1,200}$/.test(body.branch))) {
        throw new ValidationError("branch must be a git branch name", "branch");
      }
      patch.branch = body.branch as string | null;
    }
    if (hasField(body, "status")) patch.status = statusValue(body.status);
    if (hasField(body, "add_links")) patch.add_links = linksValue(body.add_links);
    if (hasField(body, "remove_links")) {
      if (!Array.isArray(body.remove_links) || body.remove_links.some((u) => typeof u !== "string")) {
        throw new ValidationError("remove_links must be a list of URLs", "remove_links");
      }
      patch.remove_links = body.remove_links as string[];
    }

    const key = `${team}-${number}`;
    const item = await updateWorkItem(team, number, patch, actor, (current) => {
      if (actor.kind !== "agent") return;
      hideTriageFromAgent(actor, current, key);
      if (patch.status !== undefined && patch.status !== current.status && !AGENT_MOVES[current.status]?.includes(patch.status)) {
        throw new ForbiddenError(`The agent cannot move ${current.status} to ${patch.status}`);
      }
    });
    if (!item) throw new NotFoundError("Work item", key);
    res.json({ item });
  })
);

// POST /api/v1/platform/work/items/CORE-12/comments { body }
workBoardRouter.post(
  "/platform/work/items/:key/comments",
  asyncHandler(async (req, res) => {
    const actor = actorOf(res);
    const { team, number } = itemKey(req);
    const text = typeof field(req.body, "body") === "string" ? (field(req.body, "body") as string).trim() : "";
    if (!text) throw new ValidationError("body is required", "body");
    if (text.length > MAX_COMMENT) throw new ValidationError(`body is longer than ${MAX_COMMENT} characters`, "body");
    const key = `${team}-${number}`;
    const event = await addWorkItemComment(team, number, text, actor, (current) => hideTriageFromAgent(actor, current, key));
    if (!event) throw new NotFoundError("Work item", key);
    res.status(201).json({ event });
  })
);
