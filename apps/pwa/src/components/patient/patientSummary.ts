/** GET /api/v1/patient/:id/summary — the Detalles strip + extra rows (NEO-206, apps/api queries/patientSummary.ts). */
export interface PatientSummary {
  preferred_name: string | null;
  shipping_address: Record<string, unknown> | null;
  data_consent_at: string | null;
  data_consent_withdrawn_at: string | null;
  /** Null for the commercial field force (rep/KAM/MSL) — never sent to them. */
  latest_study: {
    id: string;
    study_date: string | null;
    ahi_score: number | null;
    spo2_nadir: number | null;
    odi: number | null;
    diagnosis_code: Record<string, unknown> | null;
  } | null;
  device_order: {
    status: string;
    metadata: Record<string, unknown> | null;
    order_sync_status: "pending" | "synced" | "failed" | null;
    appliance_delivered_at: string | null;
  } | null;
  next_appointment: { id: string; start_at: string } | null;
}

/** The patient fields the Detalles tab reads from the base record. */
export interface PatientDetailsTabPatient {
  id: string;
  email?: string | null;
  phone?: string | null;
  practitioner_id?: string | null;
  practitioner_name?: string | null;
  practitioner_specialty?: string | null;
  practitioner_specialties?: string[] | null;
  status?: string;
  region?: string;
  territory_path?: { id: string; name: string; code: string | null; kind: string }[] | null;
  ahi_baseline?: number | null;
  cpap_device?: string | null;
  medical_record?: string | null;
  diagnosis_code?: Record<string, unknown> | null;
  created_at?: string;
}
