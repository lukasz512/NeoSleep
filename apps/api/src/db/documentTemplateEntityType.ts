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
  await client.query(`DELETE FROM platform.document_template_entity_type WHERE template_key = $1`, [templateKey]);
  for (const entityType of entityTypes) {
    await client.query(
      `INSERT INTO platform.document_template_entity_type (template_key, entity_type, created_by_user_id)
       VALUES ($1, $2, $3)`,
      [templateKey, entityType, createdByUserId]
    );
  }
}
