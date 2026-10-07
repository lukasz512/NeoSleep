import type { PoolClient } from "pg";
import { getDb } from "./connection.js";

/**
 * Platform-schema SQL for the work board (CORE-177, docs/stories/platform-work-board.md).
 * Who may do what is decided in routes/workBoard.ts; this file only reads and writes, and
 * every write leaves a platform.work_item_event row in the same transaction.
 */

/** Board order. `canceled` is a closed state with no column. */
export const WORK_STATUSES = [
  "triage",
  "backlog",
  "to_spec",
  "spec_ready",
  "approved",
  "building",
  "needs_review",
  "done",
  "canceled",
] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const WORK_LINK_KINDS = ["artifact", "spec", "pr", "ci", "other"] as const;
export type WorkLinkKind = (typeof WORK_LINK_KINDS)[number];

export type WorkActorKind = "human" | "agent" | "session" | "import";
export interface WorkActor {
  name: string;
  kind: WorkActorKind;
}

export interface WorkLink {
  kind: WorkLinkKind;
  url: string;
  title?: string;
}

export interface WorkTeamRow {
  key: string;
  name: string;
  kind: "platform" | "client";
  company_id: string | null;
  sort_order: number;
}

export interface WorkItemRow {
  id: string;
  key: string;
  team_key: string;
  number: number;
  title: string;
  problem: string | null;
  change: string | null;
  done_when: string | null;
  status: WorkStatus;
  priority: number;
  labels: string[];
  links: WorkLink[];
  branch: string | null;
  source: string;
  linear_identifier: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
  completed_at: string | null;
}

export interface WorkItemEventRow {
  id: string;
  kind: "created" | "status" | "comment" | "edit" | "link";
  from_status: WorkStatus | null;
  to_status: WorkStatus | null;
  body: string | null;
  actor: string | null;
  actor_kind: WorkActorKind;
  created_at: string;
}

const ITEM_COLUMNS = `id, team_key || '-' || number AS key, team_key, number, title, problem, change,
  done_when, status, priority, labels, links, branch, source, linear_identifier, created_by,
  created_at, updated_at, status_changed_at, completed_at`;

/** CORE-12 → { team: "CORE", number: 12 }; null when the key is not shaped like one. */
export function parseWorkItemKey(key: string): { team: string; number: number } | null {
  const match = /^([A-Z][A-Z0-9]{1,9})-(\d{1,7})$/.exec(key.trim().toUpperCase());
  return match ? { team: match[1]!, number: Number(match[2]) } : null;
}

export async function listWorkTeams(): Promise<WorkTeamRow[]> {
  const { rows } = await getDb().query<WorkTeamRow>(
    `SELECT key, name, kind, company_id, sort_order FROM platform.work_team
      WHERE NOT archived ORDER BY sort_order, key`
  );
  return rows;
}

export async function workTeamExists(key: string): Promise<boolean> {
  const { rows } = await getDb().query(`SELECT 1 FROM platform.work_team WHERE key = $1 AND NOT archived`, [key]);
  return rows.length > 0;
}

export interface WorkItemFilter {
  team?: string | null;
  statuses?: readonly WorkStatus[] | null;
}

export async function listWorkItems(filter: WorkItemFilter = {}): Promise<WorkItemRow[]> {
  const { rows } = await getDb().query<WorkItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM platform.work_item
      WHERE ($1::text IS NULL OR team_key = $1)
        AND ($2::text[] IS NULL OR status = ANY($2))
      ORDER BY priority = 0, priority, status_changed_at DESC`,
    [filter.team ?? null, filter.statuses ?? null]
  );
  return rows;
}

export async function getWorkItem(team: string, number: number): Promise<WorkItemRow | null> {
  const { rows } = await getDb().query<WorkItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM platform.work_item WHERE team_key = $1 AND number = $2`,
    [team, number]
  );
  return rows[0] ?? null;
}

export async function listWorkItemEvents(itemId: string): Promise<WorkItemEventRow[]> {
  const { rows } = await getDb().query<WorkItemEventRow>(
    `SELECT id, kind, from_status, to_status, body, actor, actor_kind, created_at
       FROM platform.work_item_event WHERE item_id = $1 ORDER BY created_at, id`,
    [itemId]
  );
  return rows;
}

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function insertEvent(
  client: PoolClient,
  itemId: string,
  actor: WorkActor,
  event: { kind: WorkItemEventRow["kind"]; from_status?: WorkStatus | null; to_status?: WorkStatus | null; body?: string | null }
): Promise<void> {
  await client.query(
    `INSERT INTO platform.work_item_event (item_id, kind, from_status, to_status, body, actor, actor_kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [itemId, event.kind, event.from_status ?? null, event.to_status ?? null, event.body ?? null, actor.name, actor.kind]
  );
}

export interface WorkItemInsert {
  team: string;
  title: string;
  problem?: string | null;
  change?: string | null;
  done_when?: string | null;
  status?: WorkStatus;
  priority?: number;
  labels?: string[];
  links?: WorkLink[];
  source?: "manual" | "agent" | "session" | "problem_report";
}

/** Takes the team's next number under a row lock, so KEY-n never repeats. */
export async function createWorkItem(input: WorkItemInsert, actor: WorkActor): Promise<WorkItemRow> {
  return inTransaction(async (client) => {
    const team = await client.query<{ number: number }>(
      `UPDATE platform.work_team SET next_number = next_number + 1
        WHERE key = $1 AND NOT archived RETURNING next_number - 1 AS number`,
      [input.team]
    );
    const number = team.rows[0]?.number;
    if (number === undefined) throw new Error(`unknown work team ${input.team}`);
    const status = input.status ?? "backlog";
    const { rows } = await client.query<WorkItemRow>(
      `INSERT INTO platform.work_item
         (team_key, number, title, problem, change, done_when, status, priority, labels, links, source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
       RETURNING ${ITEM_COLUMNS}`,
      [
        input.team,
        number,
        input.title,
        input.problem ?? null,
        input.change ?? null,
        input.done_when ?? null,
        status,
        input.priority ?? 0,
        input.labels ?? [],
        JSON.stringify(input.links ?? []),
        input.source ?? (actor.kind === "agent" || actor.kind === "session" ? actor.kind : "manual"),
        actor.name,
      ]
    );
    const item = rows[0]!;
    await insertEvent(client, item.id, actor, { kind: "created", to_status: status });
    return item;
  });
}

export interface WorkItemPatch {
  title?: string;
  problem?: string | null;
  change?: string | null;
  done_when?: string | null;
  priority?: number;
  labels?: string[];
  branch?: string | null;
  status?: WorkStatus;
  add_links?: WorkLink[];
  remove_links?: string[];
}

const EDITABLE_FIELDS = ["title", "problem", "change", "done_when", "priority", "labels", "branch"] as const;

/**
 * Applies a patch and logs it: one `status` event for a move, one `edit` event naming the
 * changed fields, one `link` event per added or removed link. `check` sees the locked current
 * row first, so a permission decision that depends on the current status can't race a move.
 */
export async function updateWorkItem(
  team: string,
  number: number,
  patch: WorkItemPatch,
  actor: WorkActor,
  check?: (current: WorkItemRow) => void
): Promise<WorkItemRow | null> {
  return inTransaction(async (client) => {
    const current = (
      await client.query<WorkItemRow>(
        `SELECT ${ITEM_COLUMNS} FROM platform.work_item WHERE team_key = $1 AND number = $2 FOR UPDATE`,
        [team, number]
      )
    ).rows[0];
    if (!current) return null;
    check?.(current);

    const changed = EDITABLE_FIELDS.filter(
      (f) => patch[f] !== undefined && JSON.stringify(patch[f]) !== JSON.stringify(current[f])
    );
    let links = current.links;
    const linkEvents: string[] = [];
    for (const link of patch.add_links ?? []) {
      if (links.some((l) => l.url === link.url)) continue;
      links = [...links, link];
      linkEvents.push(`+ ${link.kind} ${link.url}`);
    }
    for (const url of patch.remove_links ?? []) {
      if (!links.some((l) => l.url === url)) continue;
      links = links.filter((l) => l.url !== url);
      linkEvents.push(`- ${url}`);
    }
    const moved = patch.status !== undefined && patch.status !== current.status;
    if (!changed.length && !linkEvents.length && !moved) return current;

    const next = { ...current, ...Object.fromEntries(changed.map((f) => [f, patch[f]])) } as WorkItemRow;
    const status = moved ? patch.status! : current.status;
    const { rows } = await client.query<WorkItemRow>(
      `UPDATE platform.work_item SET
         title = $3, problem = $4, change = $5, done_when = $6, priority = $7, labels = $8, branch = $9,
         links = $10::jsonb, status = $11, updated_at = now(),
         status_changed_at = CASE WHEN $12 THEN now() ELSE status_changed_at END,
         completed_at = CASE WHEN $12 THEN (CASE WHEN $11 IN ('done', 'canceled') THEN now() END) ELSE completed_at END
       WHERE team_key = $1 AND number = $2
       RETURNING ${ITEM_COLUMNS}`,
      [
        team,
        number,
        next.title,
        next.problem,
        next.change,
        next.done_when,
        next.priority,
        next.labels,
        next.branch,
        JSON.stringify(links),
        status,
        moved,
      ]
    );
    if (moved) await insertEvent(client, current.id, actor, { kind: "status", from_status: current.status, to_status: status });
    if (changed.length) await insertEvent(client, current.id, actor, { kind: "edit", body: changed.join(", ") });
    for (const body of linkEvents) await insertEvent(client, current.id, actor, { kind: "link", body });
    return rows[0]!;
  });
}

export async function addWorkItemComment(
  team: string,
  number: number,
  body: string,
  actor: WorkActor,
  check?: (current: WorkItemRow) => void
): Promise<WorkItemEventRow | null> {
  return inTransaction(async (client) => {
    const current = (
      await client.query<WorkItemRow>(
        `SELECT ${ITEM_COLUMNS} FROM platform.work_item WHERE team_key = $1 AND number = $2 FOR UPDATE`,
        [team, number]
      )
    ).rows[0];
    if (!current) return null;
    check?.(current);
    const { rows } = await client.query<WorkItemEventRow>(
      `INSERT INTO platform.work_item_event (item_id, kind, body, actor, actor_kind)
       VALUES ($1, 'comment', $2, $3, $4)
       RETURNING id, kind, from_status, to_status, body, actor, actor_kind, created_at`,
      [current.id, body, actor.name, actor.kind]
    );
    await client.query(`UPDATE platform.work_item SET updated_at = now() WHERE id = $1`, [current.id]);
    return rows[0]!;
  });
}

export interface WorkSessionTokenRow {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const TOKEN_COLUMNS = "id, name, created_by, created_at, last_used_at, revoked_at";

/** Stores only the token's SHA-256; the caller hands the plaintext out once (CORE-187). */
export async function insertSessionToken(name: string, tokenSha256: string, createdBy: string): Promise<WorkSessionTokenRow> {
  const { rows } = await getDb().query<WorkSessionTokenRow>(
    `INSERT INTO platform.work_session_token (name, token_sha256, created_by) VALUES ($1, $2, $3) RETURNING ${TOKEN_COLUMNS}`,
    [name, tokenSha256, createdBy]
  );
  return rows[0]!;
}

export async function listSessionTokens(): Promise<WorkSessionTokenRow[]> {
  const { rows } = await getDb().query<WorkSessionTokenRow>(
    `SELECT ${TOKEN_COLUMNS} FROM platform.work_session_token ORDER BY revoked_at IS NOT NULL, created_at DESC`
  );
  return rows;
}

/** False when the token does not exist or was already revoked. */
export async function revokeSessionToken(id: string): Promise<boolean> {
  const { rowCount } = await getDb().query(
    `UPDATE platform.work_session_token SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
    [id]
  );
  return (rowCount ?? 0) > 0;
}

/** The live token with this hash (touching last_used_at), or null. */
export async function touchSessionToken(tokenSha256: string): Promise<WorkSessionTokenRow | null> {
  const { rows } = await getDb().query<WorkSessionTokenRow>(
    `UPDATE platform.work_session_token SET last_used_at = now()
      WHERE token_sha256 = $1 AND revoked_at IS NULL RETURNING ${TOKEN_COLUMNS}`,
    [tokenSha256]
  );
  return rows[0] ?? null;
}
