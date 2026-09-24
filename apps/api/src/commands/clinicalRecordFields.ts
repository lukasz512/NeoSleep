import { ValidationError } from "../errors.js";

/**
 * Field definitions + validation for the three clinical questionnaires
 * (migration 030, ADR-023), shared by the staff commands
 * (commands/clinicalRecords.ts) and the patient self-fill flow
 * (commands/questionnaireRequest.ts) — one validator per questionnaire, so
 * a patient-submitted answer can never pass a rule a staff-entered one
 * wouldn't. Question sets are hardcoded v1 (original NEO-36 story), not
 * config-driven.
 */

export type ClinicalRecordKind = "medical_history" | "oral_exam" | "stop_bang";
export const CLINICAL_RECORD_KINDS: readonly ClinicalRecordKind[] = ["medical_history", "oral_exam", "stop_bang"];

/** Only these can be sent to the patient as a QR self-fill link — the oral exam is a clinical finding, never self-reported. */
export type PatientFillableKind = Extract<ClinicalRecordKind, "medical_history" | "stop_bang">;
export const PATIENT_FILLABLE_KINDS: readonly PatientFillableKind[] = ["medical_history", "stop_bang"];

export const MEDICAL_HISTORY_QUESTIONS = [
  "has_anemia",
  "has_diabetes",
  "has_smoking",
  "has_endocrine_disorder",
  "has_sinusitis",
  "has_alcoholism",
  "has_hypertension",
  "has_hepatitis",
  "has_cancer",
  "has_addictions",
  "has_heart_disease",
  "has_kidney_disease",
  "has_hiv",
  "has_neurological_disorder",
] as const;

export const ORAL_EXAM_QUESTIONS = [
  "has_bruxism",
  "has_narrow_palate",
  "has_geographic_tongue",
  "has_xerostomia",
  "is_mouth_breather",
  "has_missing_teeth",
  "has_periodontal_disease",
  "has_tmj_finding",
] as const;

/** S-T-O-P: self-reported — the patient can answer these. */
export const STOP_QUESTIONS = ["snoring", "tiredness", "observed_apnea", "pressure"] as const;
/** B-A-N-G: measured/known by the clinician (BMI, age, neck circumference, sex). */
export const BANG_QUESTIONS = ["bmi_over_35", "age_over_50", "neck_circumference_over_40cm", "is_male"] as const;

export type MedicalHistoryQuestion = (typeof MEDICAL_HISTORY_QUESTIONS)[number];
export type OralExamQuestion = (typeof ORAL_EXAM_QUESTIONS)[number];
export type StopQuestion = (typeof STOP_QUESTIONS)[number];
export type BangQuestion = (typeof BANG_QUESTIONS)[number];

export type MedicalHistoryAnswers = Record<MedicalHistoryQuestion, boolean | null> & { medical_history_other: string | null };
export type OralExamAnswers = Record<OralExamQuestion, boolean | null> & {
  skeletal_class: "I" | "II" | "III" | null;
  tooth: string | null;
};
export type StopAnswers = Record<StopQuestion, boolean>;
export type BangAnswers = Record<BangQuestion, boolean | null>;

const MAX_FREE_TEXT = 500;
const SKELETAL_CLASSES = new Set(["I", "II", "III"]);

function booleanOrNull(input: Record<string, unknown>, key: string, required: boolean): boolean | null {
  const value = input[key];
  if (value === undefined || value === null) {
    if (required) throw new ValidationError(`${key} is required and must be a boolean`);
    return null;
  }
  if (typeof value !== "boolean") throw new ValidationError(`${key} must be a boolean${required ? "" : " or null"}`);
  return value;
}

function optionalText(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ValidationError(`${key} must be a string or null`);
  const trimmed = value.trim();
  if (trimmed.length > MAX_FREE_TEXT) throw new ValidationError(`${key} must be at most ${MAX_FREE_TEXT} characters`);
  return trimmed || null;
}

/**
 * Staff may leave a question unanswered (null = "not asked"); a patient
 * self-filling must answer every one — an unanswered yes/no on a form the
 * patient submitted themselves reads as "no" to a clinician later, which
 * it isn't.
 */
export function validateMedicalHistory(input: Record<string, unknown>, { requireAll }: { requireAll: boolean }): MedicalHistoryAnswers {
  const answers = {} as MedicalHistoryAnswers;
  for (const key of MEDICAL_HISTORY_QUESTIONS) answers[key] = booleanOrNull(input, key, requireAll);
  answers.medical_history_other = optionalText(input, "medical_history_other");
  if (!requireAll && MEDICAL_HISTORY_QUESTIONS.every((key) => answers[key] === null) && !answers.medical_history_other) {
    throw new ValidationError("At least one answer is required");
  }
  return answers;
}

export function validateOralExam(input: Record<string, unknown>): OralExamAnswers {
  const answers = {} as OralExamAnswers;
  for (const key of ORAL_EXAM_QUESTIONS) answers[key] = booleanOrNull(input, key, false);
  const skeletal = input.skeletal_class;
  if (skeletal !== undefined && skeletal !== null && !SKELETAL_CLASSES.has(skeletal as string)) {
    throw new ValidationError(`skeletal_class must be "I", "II", "III", or null`);
  }
  answers.skeletal_class = (skeletal ?? null) as OralExamAnswers["skeletal_class"];
  answers.tooth = optionalText(input, "tooth");
  if (ORAL_EXAM_QUESTIONS.every((key) => answers[key] === null) && !answers.skeletal_class) {
    throw new ValidationError("At least one finding is required");
  }
  return answers;
}

export function validateStop(input: Record<string, unknown>): StopAnswers {
  const answers = {} as StopAnswers;
  for (const key of STOP_QUESTIONS) answers[key] = booleanOrNull(input, key, true) as boolean;
  return answers;
}

/** B-A-N-G may be left for later (the doctor completes them after the patient's S-T-O-P) — but never partially: all four or none. */
export function validateBang(input: Record<string, unknown>, { required }: { required: boolean }): BangAnswers {
  const answers = {} as BangAnswers;
  for (const key of BANG_QUESTIONS) answers[key] = booleanOrNull(input, key, required);
  const answered = BANG_QUESTIONS.filter((key) => answers[key] !== null).length;
  if (answered !== 0 && answered !== BANG_QUESTIONS.length) {
    throw new ValidationError("bmi_over_35, age_over_50, neck_circumference_over_40cm and is_male must be answered together");
  }
  return answers;
}

export function isClinicalRecordKind(value: unknown): value is ClinicalRecordKind {
  return typeof value === "string" && (CLINICAL_RECORD_KINDS as readonly string[]).includes(value);
}

export function isPatientFillableKind(value: unknown): value is PatientFillableKind {
  return typeof value === "string" && (PATIENT_FILLABLE_KINDS as readonly string[]).includes(value);
}
