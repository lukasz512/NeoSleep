import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";

/**
 * GDPR/legal consent records (FHIR: Consent). entity_type CHECK widened to
 * include 'user' in 009_partner_invite_and_documents.sql, so a doctor's
 * `users` row can carry its own consent trail (previously only
 * practitioner/patient/lead).
 */

export interface InsertConsentInput {
  entity_type: "practitioner" | "patient" | "lead" | "user";
  entity_id: string;
  legal_basis: "consent" | "legitimate_interest" | "contract" | "legal_obligation";
  jurisdiction: string;
  purpose: string;
  granted_at?: Date;
  collected_by?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function insertConsent(client: PoolClient, input: InsertConsentInput): Promise<string> {
  try {
    const r = await client.query<{ id: string }>(
      `INSERT INTO consent (entity_type, entity_id, legal_basis, jurisdiction, purpose, granted_at, collected_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        input.entity_type,
        input.entity_id,
        input.legal_basis,
        input.jurisdiction,
        input.purpose,
        input.granted_at ?? new Date(),
        input.collected_by ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    return r.rows[0]!.id;
  } catch (err) {
    throw new DatabaseError("insertConsent", err);
  }
}
