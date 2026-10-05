import { isIPv4, isIPv6 } from "node:net";
import type { PoolClient } from "pg";
import { getDb } from "./connection.js";
import { currentRequestContext } from "../context/requestContext.js";
import { isoDate } from "../routes/utils.js";
import { formatOptionalDisplayName } from "../utils/personName.js";

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
  jurisdiction?: string | null;            // 'PL' | 'MX' — the actor's country, same values as consent.jurisdiction
  retain_until?: Date | null;
  user_ip?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retention per audit-context-r1 D1 (2026-10-05): a row that changes data is
 * evidence for the medical record and lives as long as it (PL 20 years under
 * the patient rights act, MX 5 years under NOM-004); a read is an access
 * trail only and goes after 2 years (GDPR minimisation). An unknown country
 * gets the longest period, since deleting evidence too early can't be undone.
 */
const READ_RETENTION_YEARS = 2;
const RECORD_RETENTION_YEARS: Record<string, number> = { PL: 20, MX: 5 };
const DEFAULT_RECORD_RETENTION_YEARS = 20;

export function auditRetainUntil(action: string, jurisdiction: string | null, at: Date = new Date()): Date {
  const years =
    action === "read"
      ? READ_RETENTION_YEARS
      : (jurisdiction ? RECORD_RETENTION_YEARS[jurisdiction] : undefined) ?? DEFAULT_RECORD_RETENTION_YEARS;
  const until = new Date(at);
  until.setUTCFullYear(until.getUTCFullYear() + years);
  return until;
}

/**
 * audit-context-r1 D4: the full IP is kept where it is security evidence (a
 * change); a read keeps only the network (IPv4 /24, IPv6 /48), because an IP
 * is personal data under GDPR. Anything that isn't an IP is dropped, since the
 * column is inet and a bad value would make the insert fail.
 */
export function auditIp(action: string, ip: string | null | undefined): string | null {
  if (!ip) return null;
  const plain = ip.startsWith("::ffff:") && isIPv4(ip.slice(7)) ? ip.slice(7) : ip;
  if (isIPv4(plain)) {
    return action === "read" ? `${plain.split(".").slice(0, 3).join(".")}.0` : plain;
  }
  if (isIPv6(plain)) {
    if (action !== "read") return plain;
    // Groups before a "::" are explicit; fewer than 3 of them means the rest are zeros.
    const groups = (plain.split("::")[0] ?? "").split(":").filter(Boolean);
    return `${[...groups, "0", "0", "0"].slice(0, 3).join(":")}::`;
  }
  return null;
}

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
    // Values the caller passed win; the rest comes from the request being handled.
    const request = currentRequestContext();
    const jurisdiction = data.jurisdiction ?? request?.jurisdiction ?? null;
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
        jurisdiction,
        data.retain_until  ?? auditRetainUntil(data.action, jurisdiction),
        auditIp(data.action, data.user_ip ?? request?.ip),
        data.user_agent    ?? request?.userAgent ?? null,
        data.request_id    ?? request?.requestId ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );
  } catch (err) {
    // Non-fatal: log but never propagate so business transactions are not rolled back.
    console.error("[audit] insertAuditLog failed:", (err as Error).message);
  }
}

export interface AuditLogEntry {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  outcome: string;
  entity_before: Record<string, unknown> | null;
  entity_after: Record<string, unknown> | null;
}

type AuditLogRow = {
  id: string;
  created_at: Date;
  user_id: string | null;
  user_salutation: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  outcome: string;
  entity_before: Record<string, unknown> | null;
  entity_after: Record<string, unknown> | null;
};

/**
 * Reads audit_log rows for a set of (entity_type, entity_id) pairs — used by
 * the patient History tab to show what happened to a patient plus their
 * linked sleep studies / treatment plans in one timeline. Read-only, unlike
 * insertAuditLog this DOES require a tenant-scoped client (no legacy fallback)
 * since it's new and has no callers predating withTenant().
 */
export async function getAuditLogForEntities(
  client: PoolClient,
  entityTypes: string[],
  entityIds: string[]
): Promise<AuditLogEntry[]> {
  if (entityTypes.length === 0 || entityIds.length === 0) return [];

  const result = await client.query<AuditLogRow>(
    `SELECT a.id, a.created_at, a.user_id, a.action, a.entity_type, a.entity_id, a.outcome,
            a.entity_before, a.entity_after,
            ui.title AS user_salutation, ui.first_name AS user_first_name, ui.last_name AS user_last_name
     FROM audit_log a
     LEFT JOIN users u ON a.user_id = u.id
     LEFT JOIN identities ui ON u.identity_id = ui.id
     WHERE a.entity_type = ANY($1) AND a.entity_id = ANY($2)
       AND a.action <> 'read' -- access trail (NEO-83), not a change: kept out of History timelines
     ORDER BY a.created_at DESC`,
    [entityTypes, entityIds]
  );

  return result.rows.map(toAuditLogEntry);
}

const TIMELINE_SELECT = `SELECT a.id, a.created_at, a.user_id, a.action, a.entity_type, a.entity_id, a.outcome,
            a.entity_before, a.entity_after,
            ui.title AS user_salutation, ui.first_name AS user_first_name, ui.last_name AS user_last_name
     FROM audit_log a
     LEFT JOIN users u ON a.user_id = u.id
     LEFT JOIN identities ui ON u.identity_id = ui.id`;

/**
 * CORE-133: everything that happened to a patient — their own record plus
 * every row about something linked to them (appointments incl. emails sent
 * about them, events (CORE-137), sleep studies, treatment plans, questionnaire links; deleted
 * ones too, so a deletion still shows), and any row that names the patient
 * in entity_before/entity_after/metadata (partner orders, uploads). Reads
 * stay out (NEO-83). The caller redacts fields per entity type.
 */
export async function getPatientTimeline(client: PoolClient, patientId: string): Promise<AuditLogEntry[]> {
  const result = await client.query<AuditLogRow>(
    `${TIMELINE_SELECT}
     WHERE a.action <> 'read'
       AND (
         a.entity_id = ANY(
           ARRAY[$1::text]
           || ARRAY(SELECT id::text FROM appointment WHERE patient_id = $1::uuid)
           || ARRAY(SELECT id::text FROM sleep_study WHERE patient_id = $1::uuid)
           || ARRAY(SELECT id::text FROM treatment_plan WHERE patient_id = $1::uuid)
           || ARRAY(SELECT id::text FROM questionnaire_request WHERE patient_id = $1::uuid)
           || ARRAY(SELECT encounter_id::text FROM encounter_patient WHERE patient_id = $1::uuid)
         )
         OR a.entity_after->>'patient_id' = $1::text
         OR a.entity_before->>'patient_id' = $1::text
         OR a.entity_after->'patient_ids' @> to_jsonb($1::text)
         OR a.entity_before->'patient_ids' @> to_jsonb($1::text)
         OR a.metadata->>'patient_id' = $1::text
       )
     ORDER BY a.created_at DESC`,
    [patientId]
  );
  return result.rows.map(toAuditLogEntry);
}

/**
 * CORE-133: a doctor's History — their own record plus their appointments
 * (bookings, reschedules, cancels, emails) and their encounters.
 */
export async function getPractitionerTimeline(client: PoolClient, practitionerId: string): Promise<AuditLogEntry[]> {
  const result = await client.query<AuditLogRow>(
    `${TIMELINE_SELECT}
     WHERE a.action <> 'read'
       AND (
         a.entity_id = ANY(
           ARRAY[$1::text]
           || ARRAY(SELECT id::text FROM appointment WHERE practitioner_id = $1::uuid)
           || ARRAY(SELECT id::text FROM encounter WHERE practitioner_id = $1::uuid)
         )
         OR a.entity_after->>'practitioner_id' = $1::text
         OR a.entity_before->>'practitioner_id' = $1::text
       )
     ORDER BY a.created_at DESC`,
    [practitionerId]
  );
  return result.rows.map(toAuditLogEntry);
}

/**
 * Rows written before 2026-10-05 call staff accounts "Person", a name the
 * project no longer uses. Audit rows are never rewritten (audit-context-r1
 * D3: append-only evidence), so the old name is translated on the way out.
 */
const LEGACY_ENTITY_TYPES: Record<string, string> = { Person: "User" };

function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    created_at: isoDate(row.created_at),
    user_id: row.user_id,
    user_name: formatOptionalDisplayName({
      salutation: row.user_salutation,
      first_name: row.user_first_name,
      last_name: row.user_last_name,
    }),
    action: row.action,
    entity_type: LEGACY_ENTITY_TYPES[row.entity_type] ?? row.entity_type,
    entity_id: row.entity_id,
    outcome: row.outcome,
    entity_before: row.entity_before,
    entity_after: row.entity_after,
  };
}
