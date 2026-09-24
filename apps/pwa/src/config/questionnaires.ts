/**
 * Clinical questionnaire definitions (Estudios) — question keys match the
 * API's commands/clinicalRecordFields.ts and the migration 030 columns; each
 * maps to its i18n label. Hardcoded v1 question sets (NEO-36), shared by the
 * staff dialog and the patient self-fill page.
 */

export type ClinicalRecordKind = "medical_history" | "oral_exam" | "stop_bang";
export type PatientFillableKind = "medical_history" | "stop_bang";

export interface QuestionDef {
  key: string;
  labelKey: string;
}

const q = (key: string, label: string): QuestionDef => ({ key, labelKey: `app.clinical.q.${label}` });

export const MEDICAL_HISTORY_QUESTIONS: QuestionDef[] = [
  q("has_anemia", "anemia"),
  q("has_diabetes", "diabetes"),
  q("has_smoking", "smoking"),
  q("has_endocrine_disorder", "endocrineDisorder"),
  q("has_sinusitis", "sinusitis"),
  q("has_alcoholism", "alcoholism"),
  q("has_hypertension", "hypertension"),
  q("has_hepatitis", "hepatitis"),
  q("has_cancer", "cancer"),
  q("has_addictions", "addictions"),
  q("has_heart_disease", "heartDisease"),
  q("has_kidney_disease", "kidneyDisease"),
  q("has_hiv", "hiv"),
  q("has_neurological_disorder", "neurologicalDisorder"),
];

export const ORAL_EXAM_QUESTIONS: QuestionDef[] = [
  q("has_bruxism", "bruxism"),
  q("has_narrow_palate", "narrowPalate"),
  q("has_geographic_tongue", "geographicTongue"),
  q("has_xerostomia", "xerostomia"),
  q("is_mouth_breather", "mouthBreather"),
  q("has_missing_teeth", "missingTeeth"),
  q("has_periodontal_disease", "periodontalDisease"),
  q("has_tmj_finding", "tmjFinding"),
];

/** S-T-O-P — self-reported, the part a patient can answer via QR. */
export const STOP_QUESTIONS: QuestionDef[] = [
  q("snoring", "snoring"),
  q("tiredness", "tiredness"),
  q("observed_apnea", "observedApnea"),
  q("pressure", "pressure"),
];

/** B-A-N-G — measured/known by the clinician. */
export const BANG_QUESTIONS: QuestionDef[] = [
  q("bmi_over_35", "bmiOver35"),
  q("age_over_50", "ageOver50"),
  q("neck_circumference_over_40cm", "neckCircumference"),
  q("is_male", "isMale"),
];

export const SKELETAL_CLASSES = ["I", "II", "III"] as const;

export const KIND_LABEL_KEYS: Record<ClinicalRecordKind, string> = {
  medical_history: "app.clinical.kind.medicalHistory",
  oral_exam: "app.clinical.kind.oralExam",
  stop_bang: "app.clinical.kind.stopBang",
};

/**
 * The "Add study" menu, in the order the partner dentist listed them.
 * `patientFillable` entries also offer the QR self-fill option.
 */
export const ADD_STUDY_MENU: { kind: ClinicalRecordKind | "polysomnography"; labelKey: string; patientFillable: boolean }[] = [
  { kind: "polysomnography", labelKey: "app.clinical.kind.polysomnography", patientFillable: false },
  { kind: "medical_history", labelKey: KIND_LABEL_KEYS.medical_history, patientFillable: true },
  { kind: "oral_exam", labelKey: KIND_LABEL_KEYS.oral_exam, patientFillable: false },
  { kind: "stop_bang", labelKey: KIND_LABEL_KEYS.stop_bang, patientFillable: true },
];

/** Standard STOP-Bang interpretation: 0–2 low, 3–4 intermediate, 5–8 high OSA risk. */
export function stopBangRisk(score: number): "low" | "intermediate" | "high" {
  if (score >= 5) return "high";
  if (score >= 3) return "intermediate";
  return "low";
}
