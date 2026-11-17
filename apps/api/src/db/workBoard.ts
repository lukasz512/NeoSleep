import type { PoolClient } from "pg";
import { getDb } from "./connection.js";
import { inPlatformTransaction, insertPlatformAudit, type PlatformAuditActor } from "./platformAudit.js";

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

export const WORK_CI_STATES = ["passed", "failed"] as const;
export type WorkCiState = (typeof WORK_CI_STATES)[number];

export interface WorkLink {
  kind: WorkLinkKind;
  url: string;
  title?: string;
  /** Only on a `ci` link: how that run ended. Absent until someone reports it (CORE-219). */
  state?: WorkCiState;
}

/** The label palette; the PWA maps each key to a theme colour. Same list as the CHECK in migration 068. */
export const WORK_LABEL_COLORS = ["blue", "teal", "green", "amber", "orange", "red", "pink", "purple"] as const;
export type WorkLabelColor = (typeof WORK_LABEL_COLORS)[number];

/** Marks a ticket a Claude Code session created (CORE-187). Never a catalog label. */
export const WORK_SESSION_LABEL = "session";

export interface WorkLabelRow {
  id: string;
  name: string;
  color: WorkLabelColor;
  created_at: string;
}

/** Where a ticket's code is, as reported from git (CORE-221). */
export const WORK_GIT_STATES = ["none", "dev", "prod"] as const;
export type WorkGitState = (typeof WORK_GIT_STATES)[number];

/** Keeps a ticket where it is when the board closes or tidies tickets (CORE-221, CORE-223). */
export const HOLD_LABEL = "hold";

/** Days a ticket may sit in Building without a branch before the tidy returns it to Backlog (CORE-223). */
export const BUILDING_WITHOUT_BRANCH_DAYS = 3;

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
  assignee: string | null;
  /** YYYY-MM-DD */
  due_date: string | null;
  source: string;
  linear_identifier: string | null;
  /** Set when the item mirrors something outside the board, e.g. an error kind (CORE-190). */
  external_ref: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
  completed_at: string | null;
  /** When a Claude Code session last wrote to the item; null when none ever did (CORE-219). */
  session_active_at: string | null;
  /** null until the first git report (CORE-221). */
  git_state: WorkGitState | null;
  git_sha: string | null;
  git_checked_at: string | null;
}

export interface WorkItemEventRow {
  id: string;
  kind: "created" | "status" | "comment" | "edit" | "link" | "attachment";
  from_status: WorkStatus | null;
  to_status: WorkStatus | null;
  body: string | null;
  actor: string | null;
  actor_kind: WorkActorKind;
  created_at: string;
}

const ITEM_COLUMNS = `id, team_key || '-' || number AS key, team_key, number, title, problem, change,
  done_when, status, priority, labels, links, branch, assignee, to_char(due_date, 'YYYY-MM-DD') AS due_date,
  source, linear_identifier, external_ref, created_by,
  created_at, updated_at, status_changed_at, completed_at, git_state, git_sha, git_checked_at,
  (SELECT max(e.created_at) FROM platform.work_item_event e
    WHERE e.item_id = work_item.id AND e.actor_kind = 'session') AS session_active_at`;

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

export async function getWorkItemByExternalRef(ref: string): Promise<WorkItemRow | null> {
  const { rows } = await getDb().query<WorkItemRow>(`SELECT ${ITEM_COLUMNS} FROM platform.work_item WHERE external_ref = $1`, [
    ref,
  ]);
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

const LABEL_COLUMNS = "id, name, color, created_at";

export async function listWorkLabels(): Promise<WorkLabelRow[]> {
  const { rows } = await getDb().query<WorkLabelRow>(`SELECT ${LABEL_COLUMNS} FROM platform.work_label ORDER BY lower(name)`);
  return rows;
}

/**
 * Makes sure every name has a catalog row and returns the names in the catalog's spelling
 * (names match in any case). A new label takes the palette colour the fewest labels use.
 * `session` passes through untouched.
 */
async function ensureWorkLabels(client: PoolClient, names: readonly string[]): Promise<string[]> {
  const wanted = names.filter((n) => n.toLowerCase() !== WORK_SESSION_LABEL);
  for (const name of wanted) {
    await client.query(
      `INSERT INTO platform.work_label (name, color)
       SELECT $1, (
         SELECT p.color FROM unnest($2::text[]) WITH ORDINALITY AS p(color, ord)
           LEFT JOIN platform.work_label l ON l.color = p.color
          GROUP BY p.color, p.ord ORDER BY count(l.id), p.ord LIMIT 1)
       ON CONFLICT (lower(name)) DO NOTHING`,
      [name, [...WORK_LABEL_COLORS]]
    );
  }
  const { rows } = wanted.length
    ? await client.query<{ name: string }>(`SELECT name FROM platform.work_label WHERE lower(name) = ANY($1)`, [
        wanted.map((n) => n.toLowerCase()),
      ])
    : { rows: [] };
  const spelling = new Map(rows.map((r) => [r.name.toLowerCase(), r.name]));
  return [...new Set(names.map((n) => spelling.get(n.toLowerCase()) ?? n))];
}

/**
 * Renames and/or recolours a catalog label. A rename rewrites the name on every item that
 * carries it and logs an `edit` there, all in this transaction. Null when the id is unknown;
 * "duplicate" when another label already has the name.
 */
export async function updateWorkLabel(
  id: string,
  patch: { name?: string; color?: WorkLabelColor },
  actor: WorkActor
): Promise<WorkLabelRow | "duplicate" | null> {
  return inPlatformTransaction(async (client) => {
    const current = (await client.query<WorkLabelRow>(`SELECT ${LABEL_COLUMNS} FROM platform.work_label WHERE id = $1 FOR UPDATE`, [id]))
      .rows[0];
    if (!current) return null;
    const name = patch.name ?? current.name;
    if (name.toLowerCase() !== current.name.toLowerCase()) {
      const taken = await client.query(`SELECT 1 FROM platform.work_label WHERE lower(name) = lower($1) AND id <> $2`, [name, id]);
      if (taken.rows.length) return "duplicate";
    }
    const { rows } = await client.query<WorkLabelRow>(
      `UPDATE platform.work_label SET name = $2, color = $3 WHERE id = $1 RETURNING ${LABEL_COLUMNS}`,
      [id, name, patch.color ?? current.color]
    );
    if (name !== current.name) {
      const touched = await client.query<{ id: string }>(
        `UPDATE platform.work_item SET labels = array_replace(labels, $1, $2), updated_at = now()
          WHERE labels @> ARRAY[$1]::text[] RETURNING id`,
        [current.name, name]
      );
      for (const item of touched.rows) await insertEvent(client, item.id, actor, { kind: "edit", body: "labels" });
    }
    return rows[0]!;
  });
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
  assignee?: string | null;
  due_date?: string | null;
  source?: "manual" | "agent" | "session" | "problem_report" | "error";
  external_ref?: string | null;
}

/** Takes the team's next number under a row lock, so KEY-n never repeats. */
export async function createWorkItem(input: WorkItemInsert, actor: WorkActor): Promise<WorkItemRow> {
  return inPlatformTransaction(async (client) => {
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
         (team_key, number, title, problem, change, done_when, status, priority, labels, links, source, created_by,
          assignee, due_date, external_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15)
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
        await ensureWorkLabels(client, input.labels ?? []),
        JSON.stringify(input.links ?? []),
        input.source ?? (actor.kind === "agent" || actor.kind === "session" ? actor.kind : "manual"),
        actor.name,
        input.assignee ?? null,
        input.due_date ?? null,
        input.external_ref ?? null,
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
  assignee?: string | null;
  due_date?: string | null;
  status?: WorkStatus;
  add_links?: WorkLink[];
  remove_links?: string[];
}

const EDITABLE_FIELDS = ["title", "problem", "change", "done_when", "priority", "labels", "branch", "assignee", "due_date"] as const;

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
  return inPlatformTransaction(async (client) => {
    const current = (
      await client.query<WorkItemRow>(
        `SELECT ${ITEM_COLUMNS} FROM platform.work_item WHERE team_key = $1 AND number = $2 FOR UPDATE`,
        [team, number]
      )
    ).rows[0];
    if (!current) return null;
    check?.(current);

    if (patch.labels) patch = { ...patch, labels: await ensureWorkLabels(client, patch.labels) };
    const changed = EDITABLE_FIELDS.filter(
      (f) => patch[f] !== undefined && JSON.stringify(patch[f]) !== JSON.stringify(current[f])
    );
    let links = current.links;
    const linkEvents: string[] = [];
    for (const link of patch.add_links ?? []) {
      const state = link.state ? ` (${link.state})` : "";
      const existing = links.find((l) => l.url === link.url);
      if (!existing) {
        links = [...links, link];
        linkEvents.push(`+ ${link.kind} ${link.url}${state}`);
      } else if (link.state && link.state !== existing.state) {
        // The same CI run linked again with its result: the link stays, its state moves on.
        links = links.map((l) => (l === existing ? { ...l, state: link.state } : l));
        linkEvents.push(`~ ${existing.kind} ${link.url}${state}`);
      }
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
         links = $10::jsonb, status = $11, assignee = $13, due_date = $14, updated_at = now(),
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
        next.assignee,
        next.due_date,
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
  return inPlatformTransaction(async (client) => {
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

export interface WorkGitReport {
  team: string;
  number: number;
  state: Exclude<WorkGitState, "none">;
  sha: string;
}

/**
 * Stores what git says about each reported ticket (CORE-221). With `complete` the report
 * covers the whole repository, so every other ticket becomes `none`. With `close` (the prod
 * smoke test passed) each Needs Review ticket that is on prod and not labeled `hold` moves
 * to Done, with a status event and a comment. A state change alone leaves no event: it is
 * a fact about git, not an edit of the ticket.
 *
 * With `tidy` (CORE-223) Building keeps only tickets somebody is building: one that git sees
 * on dev or prod moves to Needs Review, unless a person sent it back from there for rework;
 * one with no branch (neither the `branch` field nor a remote branch in `tidy.branches`) and
 * nothing merged after BUILDING_WITHOUT_BRANCH_DAYS returns to Backlog. Tickets labeled
 * `hold` stay. Each move leaves a status event and a comment.
 */
export async function applyWorkGitStates(
  reports: readonly WorkGitReport[],
  options: {
    complete: boolean;
    close: { smoke_url: string } | null;
    tidy?: { branches: readonly { team: string; number: number }[] } | null;
  },
  actor: WorkActor
): Promise<{ updated: number; closed: string[]; tidied: { to_review: string[]; to_backlog: string[] } }> {
  return inPlatformTransaction(async (client) => {
    const teams = reports.map((r) => r.team);
    const numbers = reports.map((r) => r.number);
    const { rowCount } = await client.query(
      `UPDATE platform.work_item w SET git_state = r.state, git_sha = r.sha, git_checked_at = now()
         FROM unnest($1::text[], $2::int[], $3::text[], $4::text[]) AS r(team, number, state, sha)
        WHERE w.team_key = r.team AND w.number = r.number`,
      [teams, numbers, reports.map((r) => r.state), reports.map((r) => r.sha)]
    );
    if (options.complete) {
      await client.query(
        `UPDATE platform.work_item w SET git_state = 'none', git_sha = NULL, git_checked_at = now()
          WHERE NOT EXISTS (SELECT 1 FROM unnest($1::text[], $2::int[]) AS r(team, number)
                             WHERE r.team = w.team_key AND r.number = w.number)`,
        [teams, numbers]
      );
    }
    const closed: string[] = [];
    if (options.close) {
      const { rows } = await client.query<WorkItemRow>(
        `UPDATE platform.work_item SET status = 'done', status_changed_at = now(), completed_at = now(), updated_at = now()
          WHERE status = 'needs_review' AND git_state = 'prod' AND NOT ($1 = ANY (labels))
          RETURNING ${ITEM_COLUMNS}`,
        [HOLD_LABEL]
      );
      for (const item of rows) {
        await insertEvent(client, item.id, actor, { kind: "status", from_status: "needs_review", to_status: "done" });
        await insertEvent(client, item.id, actor, {
          kind: "comment",
          body: `Closed automatically: commit ${(item.git_sha ?? "").slice(0, 7)} is on prod and the prod smoke test passed (${options.close.smoke_url}). Label a ticket "${HOLD_LABEL}" to keep it in Needs Review.`,
        });
        closed.push(item.key);
      }
    }
    const toReview: string[] = [];
    const toBacklog: string[] = [];
    if (options.tidy) {
      const merged = await client.query<WorkItemRow>(
        `UPDATE platform.work_item SET status = 'needs_review', status_changed_at = now(), updated_at = now()
          WHERE status = 'building' AND git_state IN ('dev', 'prod') AND NOT ($1 = ANY (labels))
            AND 'needs_review' IS DISTINCT FROM (SELECT e.from_status FROM platform.work_item_event e
                                                  WHERE e.item_id = work_item.id AND e.kind = 'status'
                                                  ORDER BY e.id DESC LIMIT 1)
          RETURNING ${ITEM_COLUMNS}`,
        [HOLD_LABEL]
      );
      for (const item of merged.rows) {
        await insertEvent(client, item.id, actor, { kind: "status", from_status: "building", to_status: "needs_review" });
        await insertEvent(client, item.id, actor, {
          kind: "comment",
          body: `Moved to Needs Review automatically: commit ${(item.git_sha ?? "").slice(0, 7)} is on ${item.git_state}. Label a ticket "${HOLD_LABEL}" to keep it in Building.`,
        });
        toReview.push(item.key);
      }
      const idle = await client.query<WorkItemRow>(
        `UPDATE platform.work_item SET status = 'backlog', status_changed_at = now(), updated_at = now()
          WHERE status = 'building' AND branch IS NULL AND COALESCE(git_state, 'none') = 'none'
            AND status_changed_at < now() - make_interval(days => $2::int)
            AND NOT ($1 = ANY (labels))
            AND NOT EXISTS (SELECT 1 FROM unnest($3::text[], $4::int[]) AS b(team, number)
                             WHERE b.team = work_item.team_key AND b.number = work_item.number)
          RETURNING ${ITEM_COLUMNS}`,
        [HOLD_LABEL, BUILDING_WITHOUT_BRANCH_DAYS, options.tidy.branches.map((b) => b.team), options.tidy.branches.map((b) => b.number)]
      );
      for (const item of idle.rows) {
        await insertEvent(client, item.id, actor, { kind: "status", from_status: "building", to_status: "backlog" });
        await insertEvent(client, item.id, actor, {
          kind: "comment",
          body: `Returned to Backlog automatically: ${BUILDING_WITHOUT_BRANCH_DAYS} days in Building with no branch and nothing merged. Building is for tickets with a branch (pnpm board branch). Label a ticket "${HOLD_LABEL}" to keep it there.`,
        });
        toBacklog.push(item.key);
      }
    }
    return { updated: rowCount ?? 0, closed: closed.sort(), tidied: { to_review: toReview.sort(), to_backlog: toBacklog.sort() } };
  });
}

export const WORK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export interface WorkAttachmentRow {
  id: string;
  item_id: string;
  /** The comment it was posted with; null when it belongs to the item itself. */
  event_id: string | null;
  path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

const ATTACHMENT_COLUMNS = "id, item_id, event_id, path, filename, mime_type, size_bytes, uploaded_by, created_at";

export async function listWorkAttachments(itemId: string): Promise<WorkAttachmentRow[]> {
  const { rows } = await getDb().query<WorkAttachmentRow>(
    `SELECT ${ATTACHMENT_COLUMNS} FROM platform.work_item_attachment WHERE item_id = $1 ORDER BY created_at, id`,
    [itemId]
  );
  return rows;
}

export async function getWorkAttachment(itemId: string, id: string): Promise<WorkAttachmentRow | null> {
  const { rows } = await getDb().query<WorkAttachmentRow>(
    `SELECT ${ATTACHMENT_COLUMNS} FROM platform.work_item_attachment WHERE item_id = $1 AND id = $2`,
    [itemId, id]
  );
  return rows[0] ?? null;
}

/** Records an already-uploaded object and logs it on the item. Null when `event_id` is not a comment on this item. */
export async function insertWorkAttachment(
  input: { item_id: string; event_id: string | null; path: string; filename: string; mime_type: string; size_bytes: number },
  actor: WorkActor
): Promise<WorkAttachmentRow | null> {
  return inPlatformTransaction(async (client) => {
    const { rows } = await client.query<WorkAttachmentRow>(
      `INSERT INTO platform.work_item_attachment (item_id, event_id, path, filename, mime_type, size_bytes, uploaded_by)
       SELECT $1, $2, $3, $4, $5, $6, $7
        WHERE $2::bigint IS NULL
           OR EXISTS (SELECT 1 FROM platform.work_item_event WHERE id = $2 AND item_id = $1 AND kind = 'comment')
       RETURNING ${ATTACHMENT_COLUMNS}`,
      [input.item_id, input.event_id, input.path, input.filename, input.mime_type, input.size_bytes, actor.name]
    );
    const row = rows[0];
    if (!row) return null;
    await insertEvent(client, input.item_id, actor, { kind: "attachment", body: `+ ${input.filename}` });
    await client.query(`UPDATE platform.work_item SET updated_at = now() WHERE id = $1`, [input.item_id]);
    return row;
  });
}

/** Deletes the row and logs it; the caller removes the stored object. Null when it was not there. */
export async function deleteWorkAttachment(itemId: string, id: string, actor: WorkActor): Promise<WorkAttachmentRow | null> {
  return inPlatformTransaction(async (client) => {
    const { rows } = await client.query<WorkAttachmentRow>(
      `DELETE FROM platform.work_item_attachment WHERE item_id = $1 AND id = $2 RETURNING ${ATTACHMENT_COLUMNS}`,
      [itemId, id]
    );
    const row = rows[0];
    if (!row) return null;
    await insertEvent(client, itemId, actor, { kind: "attachment", body: `- ${row.filename}` });
    return row;
  });
}

/** Platform staff who can be assigned work: active platform.users with a board role. */
export async function listWorkPeople(): Promise<{ email: string; name: string }[]> {
  const { rows } = await getDb().query<{ email: string; name: string }>(
    `SELECT email, name FROM platform.users WHERE is_active AND role IN ('owner', 'admin', 'support') ORDER BY name, email`
  );
  return rows;
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
/** Issuing and revoking a token are platform-admin actions: each leaves a platform.audit row (CORE-213). */
export async function insertSessionToken(name: string, tokenSha256: string, createdBy: string, actor: PlatformAuditActor): Promise<WorkSessionTokenRow> {
  return inPlatformTransaction(async (client) => {
    const { rows } = await client.query<WorkSessionTokenRow>(
      `INSERT INTO platform.work_session_token (name, token_sha256, created_by) VALUES ($1, $2, $3) RETURNING ${TOKEN_COLUMNS}`,
      [name, tokenSha256, createdBy]
    );
    const row = rows[0]!;
    await insertPlatformAudit(client, actor, { action: "board.session_token.issue", targetType: "work_session_token", targetId: row.id, after: { name } });
    return row;
  });
}

export async function listSessionTokens(): Promise<WorkSessionTokenRow[]> {
  const { rows } = await getDb().query<WorkSessionTokenRow>(
    `SELECT ${TOKEN_COLUMNS} FROM platform.work_session_token ORDER BY revoked_at IS NOT NULL, created_at DESC`
  );
  return rows;
}

/** False when the token does not exist or was already revoked. */
export async function revokeSessionToken(id: string, actor: PlatformAuditActor): Promise<boolean> {
  return inPlatformTransaction(async (client) => {
    const { rows } = await client.query<{ name: string }>(
      `UPDATE platform.work_session_token SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING name`,
      [id]
    );
    if (!rows[0]) return false;
    await insertPlatformAudit(client, actor, { action: "board.session_token.revoke", targetType: "work_session_token", targetId: id, before: { name: rows[0].name } });
    return true;
  });
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
