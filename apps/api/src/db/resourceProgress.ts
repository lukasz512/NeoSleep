import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";
import type { ProgressState, ProgressStatus } from "../services/partners/resourceProgress.js";

/** Watch progress per user and partner video (NEO-209, migration 043). */

export interface ResourceProgressRow {
  resource_id: string;
  status: ProgressStatus;
  position_sec: number;
  max_position_sec: number;
  duration_sec: number | null;
  completed_at: Date | null;
  updated_at: Date;
}

const COLUMNS = "resource_id, status, position_sec, max_position_sec, duration_sec, completed_at, updated_at";

export async function listResourceProgress(client: PoolClient, userId: string, partner: string): Promise<ResourceProgressRow[]> {
  try {
    const { rows } = await client.query<ResourceProgressRow>(
      `SELECT ${COLUMNS} FROM resource_progress WHERE user_id = $1 AND partner = $2 ORDER BY updated_at DESC`,
      [userId, partner]
    );
    return rows;
  } catch (err) {
    throw new DatabaseError("listResourceProgress", err);
  }
}

/** Locks the row for the read-modify-write in the route (two tabs reporting at once). */
export async function getResourceProgressForUpdate(
  client: PoolClient,
  userId: string,
  partner: string,
  resourceId: string
): Promise<ResourceProgressRow | null> {
  try {
    const { rows } = await client.query<ResourceProgressRow>(
      `SELECT ${COLUMNS} FROM resource_progress WHERE user_id = $1 AND partner = $2 AND resource_id = $3 FOR UPDATE`,
      [userId, partner, resourceId]
    );
    return rows[0] ?? null;
  } catch (err) {
    throw new DatabaseError("getResourceProgressForUpdate", err);
  }
}

export async function saveResourceProgress(
  client: PoolClient,
  userId: string,
  partner: string,
  resourceId: string,
  state: ProgressState
): Promise<ResourceProgressRow> {
  try {
    const { rows } = await client.query<ResourceProgressRow>(
      `INSERT INTO resource_progress
         (user_id, partner, resource_id, status, position_sec, max_position_sec, duration_sec, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $4 = 'completed' THEN now() END)
       ON CONFLICT (user_id, partner, resource_id) DO UPDATE SET
         status           = EXCLUDED.status,
         position_sec     = EXCLUDED.position_sec,
         max_position_sec = EXCLUDED.max_position_sec,
         duration_sec     = COALESCE(EXCLUDED.duration_sec, resource_progress.duration_sec),
         completed_at     = CASE
                              WHEN EXCLUDED.status <> 'completed' THEN NULL
                              ELSE COALESCE(resource_progress.completed_at, now())
                            END,
         updated_at       = now()
       RETURNING ${COLUMNS}`,
      [userId, partner, resourceId, state.status, state.positionSec, state.maxPositionSec, state.durationSec]
    );
    return rows[0]!;
  } catch (err) {
    throw new DatabaseError("saveResourceProgress", err);
  }
}
