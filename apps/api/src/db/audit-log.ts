import type { PoolClient } from "pg";
import { getDb } from "./connection.js";

/**
 * Full audit log row. Aligns with the audit_log table in the tenant schema (FHIR: AuditEvent).
 *
 * IMPORTANT: audit_log lives inside the TENANT schema (e.g. neosleep_pl.audit_log).
 * The caller must pass the PoolClient from withTenant() — the one that already has
 * SET LOCAL search_path in effect. Never call this with a pool-level getDb().query()
 * because that would target the wrong (public) schema and silently fail.
 *
 * Usage (inside a withTenant() callback):
 *   return withTenant(slug, async (client) => {
 *     await insertAuditLog(client, { action: 'create', entity_type: 'Encounter', ... });
 *     await insertEncounter(client, input);
 *   });
 */
export interface AuditLogInsert {
  user_id?: string | null;
  action: string;                          // 'create' | 'update' | 'delete' | 'read'
  entity_type: string;                     // FHIR resource name: 'Encounter' | 'Practitioner' ...
  entity_id?: string | null;
  outcome?: string;                        // 'success' | 'minor_failure' | 'serious_failure'
  entity_before?: Record<string, unknown> | null;
  entity_after?: Record<string, unknown> | null;
  legal_basis?: string | null;             // 'legitimate_interest' | 'consent' | 'contract'
  jurisdiction?: string | null;            // 'EU' | 'MX' | 'US'
  retain_until?: Date | null;
  user_ip?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Inserts an audit record using the tenant-scoped PoolClient.
 * The write is non-throwing — errors are logged to stderr but never propagate
 * (audit failures must not roll back business transactions).
 *
 * Preferred: pass a PoolClient from inside a withTenant() callback so the
 * correct tenant search_path is in effect.
 *
 * Legacy: omit client — falls back to the pool default connection.
 * Use only in routes that have not yet been migrated to withTenant().
 * TODO: migrate leads.ts + practitioner.ts to withTenant() and remove fallback.
 */
export async function insertAuditLog(clientOrRow: PoolClient | AuditLogInsert, row?: AuditLogInsert): Promise<void> {
  let client: { query: PoolClient["query"] };
  let data: AuditLogInsert;

  if (row !== undefined) {
    // New API: insertAuditLog(client, row)
    client = clientOrRow as PoolClient;
    data = row;
  } else {
    // Legacy API: insertAuditLog(row) — no tenant-scoped client
    client = getDb();
    data = clientOrRow as AuditLogInsert;
  }

  try {
    const userId = data.user_id?.trim();
    const isValidUuid = userId && UUID_RE.test(userId);
    const entityId = data.entity_id ?? null;
    const isValidEntityUuid = entityId && UUID_RE.test(entityId);

    await client.query(
      `INSERT INTO audit_log
         (user_id, action, entity_type, entity_id, outcome,
          entity_before, entity_after, legal_basis, jurisdiction, retain_until,
          user_ip, user_agent, request_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        isValidUuid ? userId : null,
        data.action,
        data.entity_type,
        isValidEntityUuid ? entityId : null,
        data.outcome ?? "success",
        data.entity_before ? JSON.stringify(data.entity_before) : null,
        data.entity_after  ? JSON.stringify(data.entity_after)  : null,
        data.legal_basis   ?? null,
        data.jurisdiction  ?? null,
        data.retain_until  ?? null,
        data.user_ip       ?? null,
        data.user_agent    ?? null,
        data.request_id    ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );
  } catch (err) {
    // Non-fatal: log but never propagate so business transactions are not rolled back.
    console.error("[audit] insertAuditLog failed:", (err as Error).message);
  }
}
