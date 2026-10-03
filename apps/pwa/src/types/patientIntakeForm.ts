/** Mirrors apps/api's PatientIntakeFormStatus — one entry per document template assigned to patients, in DOCUMENT_MANIFEST order (NEO-54). */
export interface PatientIntakeFormStatus {
  key: string;
  done: boolean;
  /** List column (NEO-221): "document" → Documents, "study" → Studies (lab/device results, e.g. polysomnography). */
  category?: "document" | "study";
  /** The patient can still fill it through a QR link — the list's Next step (NEO-221). */
  waiting_on_patient?: boolean;
}
