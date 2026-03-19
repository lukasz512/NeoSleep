import { getDb } from "./connection.js";

export interface ConsoleLogInsert {
  level: string;
  message: string;
  message_hash?: string | null;
  stack?: string | null;
  source?: string;
  env?: string;
  user_id?: string | null;
  request_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function insertConsoleLog(row: ConsoleLogInsert): Promise<void> {
  const p = getDb();
  if (!p) return;
  try {
    await p.query(
      `INSERT INTO tbl_console_errors (level, message, message_hash, stack, source, env, user_id, request_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        row.level || "log",
        row.message,
        row.message_hash ?? null,
        row.stack ?? null,
        row.source ?? "api",
        row.env ?? process.env.NODE_ENV ?? "development",
        row.user_id ?? null,
        row.request_id ?? null,
        row.metadata ? JSON.stringify(row.metadata) : null,
      ]
    );
  } catch (err) {
    console.error("insertConsoleLog error:", err);
  }
}
