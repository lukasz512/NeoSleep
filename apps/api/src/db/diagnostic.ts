import { createHash } from "node:crypto";
import { getDb } from "./connection.js";
import { DEPLOY_ENV } from "../env.js";

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
  /** The grouping key (message + top app frame); empty when nothing was written. */
  hash: string;
}

const MAX_NORMALISED_LENGTH = 2000;

/**
 * Collapses the parts of an error message that differ between occurrences of
 * the same error (ids, timestamps, numbers) so they group into one row.
 */
export function normaliseDiagnosticMessage(message: string): string {
  return canonicalNullAccess(String(message))
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g, "<ts>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/0x[0-9a-f]+/gi, "<hex>")
    .replace(/\b[0-9a-f]{12,}\b/gi, "<hex>")
    .replace(/\d{4,}/g, "<n>")
    .trim()
    .slice(0, MAX_NORMALISED_LENGTH);
}

/**
 * Browsers word the same null access differently (CORE-190: one AuthOrbs bug was 1,385
 * rows). Each wording becomes `null-deref <prop>` / `undefined-deref <prop>`, so the
 * Firefox, Safari and Chrome reports of one bug group together.
 */
function canonicalNullAccess(message: string): string {
  return message
    .replace(/can't access property "([\w$]+)",? [\w$.]+ is (null|undefined)/g, "$2-deref $1")
    .replace(/(null|undefined) is not an object \(evaluating '([^']*)'\)/g, (_m, kind: string, expr: string) => {
      const prop = /\.([\w$]+)\s*(?:=[^=].*)?$/.exec(expr.trim())?.[1] ?? expr.trim();
      return `${kind}-deref ${prop}`;
    })
    .replace(/Cannot (?:read|set) propert(?:y|ies) of (null|undefined) \((?:reading|setting) '([\w$]+)'\)/g, "$1-deref $2")
    .replace(/\b(?:Type|Reference)Error: /g, "")
    .replace(/\b(?:Uncaught|Unhandled rejection:?) /gi, "");
}

/**
 * The first stack frame in our own code, without line, column or build hash:
 * `setElement@https://pwa.x/assets/AuthOrbs-BqX1a2b3.js:1:234` → `AuthOrbs`,
 * `at f (/app/dist/routes/users.js:12:3)` → `users`. Empty when there is no stack.
 */
export function topAppFrame(stack: string | null | undefined): string {
  for (const line of String(stack ?? "").split("\n")) {
    if (/node_modules|\/vendor[-.]|<anonymous>|node:internal/.test(line)) continue;
    const file = /([\w$-]+)\.(?:m?js|ts|vue)(?:\?[^:)\s]*)?:\d+/.exec(line)?.[1];
    if (file) return file.replace(/-[\w$]{6,12}$/, "");
  }
  return "";
}

/** Grouping key of an error kind: the normalised message plus the top app frame. */
export function diagnosticMessageHash(message: string, stack?: string | null): string {
  const frame = topAppFrame(stack);
  return createHash("sha256")
    .update(normaliseDiagnosticMessage(message) + (frame ? `|${frame}` : ""))
    .digest("hex");
}

/** Affected users are counted by hashed id, so ticket ranking never needs the raw id. */
export function diagnosticUserHash(userId: string): string {
  return createHash("sha256").update(`diagnostic-user|${userId}`).digest("hex");
}

/**
 * Records a diagnostic. The same error (env + source + message hash) is
 * one row: repeats bump count and last_seen, a resolved row reopens (a
 * regression), a dismissed row keeps its status so the UI can mute it.
 * Never throws — diagnostics must not break the request that reports them.
 * Writes of one group are serialised by a transaction-scoped advisory lock: two
 * simultaneous failures used to both miss the UPDATE and both INSERT (CORE-152).
 */
export async function insertDiagnostic(row: DiagnosticInsert): Promise<DiagnosticWriteResult> {
  const p = getDb();
  if (!p) return { id: null, isNew: false, hash: "" };
  const client = await p.connect().catch((err: unknown) => {
    console.error("insertDiagnostic error:", err);
    return null;
  });
  if (!client) return { id: null, isNew: false, hash: "" };
  try {
    const level = row.level || "log";
    const source = row.source ?? "api";
    const env = row.env ?? DEPLOY_ENV;
    const hash = row.message_hash ?? diagnosticMessageHash(row.message, row.stack);
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
    if (row.user_id) {
      await client.query(
        `INSERT INTO platform.diagnostic_user (env, message_hash, user_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [env, hash, diagnosticUserHash(row.user_id)]
      );
    }
    if (bumped.rows[0]) {
      await client.query("COMMIT");
      return { id: bumped.rows[0].id, isNew: false, hash };
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO platform.diagnostics (level, message, message_hash, stack, source, env, tenant_slug, user_id, request_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [level, row.message, hash, row.stack ?? null, source, env, row.tenant_slug ?? null, row.user_id ?? null, row.request_id ?? null, metadata]
    );
    await client.query("COMMIT");
    return { id: inserted.rows[0]?.id ?? null, isNew: true, hash };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("insertDiagnostic error:", err);
    return { id: null, isNew: false, hash: "" };
  } finally {
    client.release();
  }
}
