import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";

/** The patient-signed consent document (platform.document_template_entity_type, fill_mode 'consent'). */
export const INFORMED_CONSENT_KEY = "informedConsent";

export interface InformedConsentState {
  /** The tenant gives patients this document to sign AND there is a current text in the patient's language. */
  applicable: boolean;
  /** A non-withdrawn signature of a CURRENT text version, or a scan the clinic uploaded. A signature of an older text doesn't count: a new version is asked for at the next contact (consents epic, round 1). */
  signed: boolean;
}

/**
 * CORE-113: whether the appointment emails should ask the patient to sign the
 * informed consent. Reads platform.document_content_version (current text per
 * locale) and the tenant's consent / file_attachment rows.
 */
export async function getInformedConsentState(client: PoolClient, patientId: string, locale: string): Promise<InformedConsentState> {
  try {
    const { rows } = await client.query<{ assigned: boolean; has_text: boolean; signed: boolean }>(
      `SELECT
         EXISTS (SELECT 1 FROM platform.document_template_entity_type
                  WHERE template_key = $2 AND entity_type = 'patient' AND fill_mode = 'consent') AS assigned,
         EXISTS (SELECT 1 FROM platform.document_content_version
                  WHERE template_key = $2 AND locale = $3 AND is_current) AS has_text,
         (EXISTS (SELECT 1 FROM consent c
                   WHERE c.entity_type = 'patient' AND c.entity_id = $1 AND c.purpose = $2 AND c.withdrawn_at IS NULL
                     AND c.metadata->>'content_version_id' IN (
                       SELECT v.id::text FROM platform.document_content_version v WHERE v.template_key = $2 AND v.is_current))
          OR EXISTS (SELECT 1 FROM file_attachment f
                      WHERE f.entity_type = 'patient' AND f.entity_id = $1
                        AND f.metadata->>'document_type' = 'study_upload' AND f.metadata->>'checklist_item' = $2)) AS signed`,
      [patientId, INFORMED_CONSENT_KEY, locale]
    );
    const row = rows[0];
    return { applicable: Boolean(row?.assigned && row.has_text), signed: Boolean(row?.signed) };
  } catch (err) {
    throw new DatabaseError("getInformedConsentState", err);
  }
}
