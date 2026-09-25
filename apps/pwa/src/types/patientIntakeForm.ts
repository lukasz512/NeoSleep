/** Mirrors apps/api's PatientIntakeFormStatus — one entry per document template assigned to patients, in DOCUMENT_MANIFEST order (NEO-54). */
export interface PatientIntakeFormStatus {
  key: string;
  done: boolean;
}
