import { getDb } from "./connection.js";

export interface AuditLogInsert {
  user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function insertAuditLog(row: AuditLogInsert): Promise<void> {
  const p = getDb();
  if (!p) return;
  try {
    const userId = row.user_id?.trim();
    const isValidUuid = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    await p.query(
      `INSERT INTO tbl_audit_log (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        isValidUuid ? userId : null,
        row.action,
        row.entity_type,
        row.entity_id ?? null,
        row.metadata ? JSON.stringify(row.metadata) : null,
      ]
    );
  } catch (err) {
    console.error("insertAuditLog error:", err);
  }
}
