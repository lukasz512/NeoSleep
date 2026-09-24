import type { PoolClient } from "pg";

/**
 * platform.document_template_entity_type rows — see
 * apps/api/migrations/025_document_template_entity_type.sql and
 * docs/ADR-021-document-template-entity-type-assignment.md. Every function
 * here must be called with a PoolClient obtained from db/tenant.ts's
 * withPlatform(), same division of responsibility documentContent.ts has
 * with its own platform-schema table.
 */

export const DOCUMENT_TEMPLATE_ENTITY_TYPES = ["lead", "patient", "practitioner", "organization"] as const;
export type DocumentTemplateEntityType = (typeof DOCUMENT_TEMPLATE_ENTITY_TYPES)[number];

export async function getEntityTypesForTemplate(client: PoolClient, templateKey: string): Promise<string[]> {
  const { rows } = await client.query<{ entity_type: string }>(
    `SELECT entity_type FROM platform.document_template_entity_type WHERE template_key = $1 ORDER BY entity_type`,
    [templateKey]
  );
  return rows.map((r) => r.entity_type);
}

/** Small table (≲ dozens of templates × 4 entity types) — a full scan per entity type is trivial at this scale, no dedicated index needed. */
export async function getTemplateKeysForEntityType(client: PoolClient, entityType: string): Promise<string[]> {
  const { rows } = await client.query<{ template_key: string }>(
    `SELECT template_key FROM platform.document_template_entity_type WHERE entity_type = $1 ORDER BY template_key`,
    [entityType]
  );
  return rows.map((r) => r.template_key);
}

/**
 * Full-replace, delete-then-insert per template_key — same shape as the
 * user_roles precedent (db/users.ts's updateUser), but against the
 * platform pool, not tenant. This table is current-state config, not a
 * legal record, so a plain replace (no versioning) is correct here.
 */
export async function setEntityTypesForTemplate(
  client: PoolClient,
  templateKey: string,
  entityTypes: string[],
  createdByUserId: string
): Promise<void> {
  // The patient row also carries the checklist config (migration 031) —
  // keep it across the delete-then-insert, so re-saving the entity types
  // never silently drops "who fills it / position".
  const kept = await getPatientChecklistConfig(client, templateKey);
  await client.query(`DELETE FROM platform.document_template_entity_type WHERE template_key = $1`, [templateKey]);
  for (const entityType of entityTypes) {
    const config = entityType === "patient" ? kept : null;
    await client.query(
      `INSERT INTO platform.document_template_entity_type (template_key, entity_type, created_by_user_id, fill_mode, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [templateKey, entityType, createdByUserId, config?.fill_mode ?? null, config?.sort_order ?? null]
    );
  }
}

// ---------------------------------------------------------------------------
// Patient Estudios checklist config (migration 031, ADR-024) — who fills a
// document and where it sits, only meaningful on the entity_type='patient'
// row.
// ---------------------------------------------------------------------------

export const CHECKLIST_FILL_MODES = ["consent", "patient", "doctor", "external"] as const;
export type ChecklistFillMode = (typeof CHECKLIST_FILL_MODES)[number];

export interface PatientChecklistConfig {
  template_key: string;
  fill_mode: ChecklistFillMode | null;
  sort_order: number | null;
}

/** Null when the template isn't assigned to patients at all. */
export async function getPatientChecklistConfig(client: PoolClient, templateKey: string): Promise<PatientChecklistConfig | null> {
  const { rows } = await client.query<PatientChecklistConfig>(
    `SELECT template_key, fill_mode, sort_order FROM platform.document_template_entity_type
      WHERE template_key = $1 AND entity_type = 'patient'`,
    [templateKey]
  );
  return rows[0] ?? null;
}

/** Returns false when the template isn't assigned to patients (nothing to configure). */
export async function setPatientChecklistConfig(
  client: PoolClient,
  templateKey: string,
  fillMode: ChecklistFillMode,
  sortOrder: number
): Promise<boolean> {
  const result = await client.query(
    `UPDATE platform.document_template_entity_type SET fill_mode = $2, sort_order = $3
      WHERE template_key = $1 AND entity_type = 'patient'`,
    [templateKey, fillMode, sortOrder]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Every document assigned to patients, in checklist order (unconfigured ones last, alphabetically). */
export async function listPatientChecklistConfig(client: PoolClient): Promise<PatientChecklistConfig[]> {
  const { rows } = await client.query<PatientChecklistConfig>(
    `SELECT template_key, fill_mode, sort_order FROM platform.document_template_entity_type
      WHERE entity_type = 'patient'
      ORDER BY sort_order NULLS LAST, template_key`
  );
  return rows;
}
