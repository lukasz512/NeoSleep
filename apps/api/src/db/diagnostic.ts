import { createHash } from "node:crypto";
import { getDb } from "./connection.js";

export interface DiagnosticInsert {
  level: string;
  message: string;
  message_hash?: string | null;
  stack?: string | null;
  source?: string;
  env?: string;
  tenant_slug?: string | null;
  user_id?: string | null;
  request_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface DiagnosticWriteResult {
  /** Row id, or null when nothing was written (no pool, or the write failed). */
  id: string | null;
  /** True when this call created a new error kind; false when it bumped an existing row. */
  isNew: boolean;
}

const MAX_NORMALISED_LENGTH = 2000;

/**
 * Collapses the parts of an error message that differ between occurrences of
 * the same error (ids, timestamps, numbers) so they group into one row.
 */
export function normaliseDiagnosticMessage(message: string): string {
  return String(message)
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g, "<ts>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/0x[0-9a-f]+/gi, "<hex>")
    .replace(/\b[0-9a-f]{12,}\b/gi, "<hex>")
    .replace(/\d{4,}/g, "<n>")
    .trim()
    .slice(0, MAX_NORMALISED_LENGTH);
}

export function diagnosticMessageHash(message: string): string {
  return createHash("sha256").update(normaliseDiagnosticMessage(message)).digest("hex");
}

/**
 * Records a diagnostic. The same error (env + source + normalised message) is
 * one row: repeats bump count and last_seen, a resolved row reopens (a
 * regression), a dismissed row keeps its status so the UI can mute it.
 * Never throws — diagnostics must not break the request that reports them.
 * Writes of one group are serialised by a transaction-scoped advisory lock: two
 * simultaneous failures used to both miss the UPDATE and both INSERT (CORE-152).
 */
export async function insertDiagnostic(row: DiagnosticInsert): Promise<DiagnosticWriteResult> {
  const p = getDb();
  if (!p) return { id: null, isNew: false };
  const client = await p.connect().catch((err: unknown) => {
    console.error("insertDiagnostic error:", err);
    return null;
  });
  if (!client) return { id: null, isNew: false };
  try {
    const level = row.level || "log";
    const source = row.source ?? "api";
    const env = row.env ?? process.env.NODE_ENV ?? "development";
    const hash = row.message_hash ?? diagnosticMessageHash(row.message);
    const metadata = row.metadata ? JSON.stringify(row.metadata) : null;

    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`diagnostic|${env}|${source}|${hash}`]);
    const bumped = await client.query<{ id: string }>(
      `UPDATE platform.diagnostics
          SET count       = count + 1,
              last_seen   = now(),
              status      = CASE WHEN status = 'resolved' THEN 'open' ELSE status END,
              request_id  = COALESCE($4, request_id),
              user_id     = COALESCE($5, user_id),
              tenant_slug = COALESCE($6, tenant_slug),
              metadata    = COALESCE($7::jsonb, metadata)
        WHERE id = (SELECT id FROM platform.diagnostics
                     WHERE env = $1 AND source = $2 AND message_hash = $3
                     ORDER BY last_seen DESC LIMIT 1)
        RETURNING id`,
      [env, source, hash, row.request_id ?? null, row.user_id ?? null, row.tenant_slug ?? null, metadata]
    );
    if (bumped.rows[0]) {
      await client.query("COMMIT");
      return { id: bumped.rows[0].id, isNew: false };
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO platform.diagnostics (level, message, message_hash, stack, source, env, tenant_slug, user_id, request_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [level, row.message, hash, row.stack ?? null, source, env, row.tenant_slug ?? null, row.user_id ?? null, row.request_id ?? null, metadata]
    );
    await client.query("COMMIT");
    return { id: inserted.rows[0]?.id ?? null, isNew: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("insertDiagnostic error:", err);
    return { id: null, isNew: false };
  } finally {
    client.release();
  }
}
