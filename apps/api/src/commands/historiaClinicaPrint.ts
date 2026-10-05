import { documentT } from "@neo/documents";
import type { MedicalHistoryRecord, OralExamRecord, StopBangRecord, TmjExamRecord } from "../db/clinicalRecords.js";
import type { ChoiceField } from "../services/documentRenderer.js";
import { ORAL_EXAM_QUESTIONS, STOP_QUESTIONS, BANG_QUESTIONS, TMJ_FINDINGS } from "./clinicalRecordFields.js";

/**
 * The Historia clínica v2 print (Łukasz, 2026-10-05): the values its summary
 * tiles, skull and STOP-Bang table need on top of the per-question
 * tick-boxes patientChecklist.ts already fills. `states` go to the
 * renderer's stateFields (data-state tokens the template's CSS draws: gauge
 * needle 0–8, skull glow 0–5 per side, ticked boxes); nothing recorded →
 * no state, so a blank form prints clean.
 */

export interface HistoriaClinicaInput {
  /** The patient's own contact details, printed in the banner (NEO-249); blank → a write-in line. */
  patientPhone: string | null;
  patientEmail: string | null;
  /** "YYYY-MM-DD" */
  birthDate: string | null;
  /** identities.gender: male | female | other | prefer_not_to_say | null (NEO-253). */
  gender: string | null;
  today: Date;
  history: MedicalHistoryRecord | null;
  oral: OralExamRecord | null;
  tmj: TmjExamRecord | null;
  screening: StopBangRecord | null;
}

export interface HistoriaClinicaPrint {
  fields: Record<string, string>;
  choices: Record<string, ChoiceField>;
  states: Record<string, string>;
}

const YES_NO = ["Sí", "No"] as const;
/** identities.gender → its Sexo box (index into sexOptions); prefer_not_to_say has no box. */
const SEX_BOX: Record<string, number> = { female: 0, male: 1, other: 2 };
/** The oral exam's yes/no findings still asked (has_tmj_finding was replaced by the ATM evaluation, migration 049). */
const ORAL_FINDINGS = ORAL_EXAM_QUESTIONS.filter((q) => q !== "has_tmj_finding");
/** STOP-Bang column → the template's state key (S, T, O, P, B, A, N, G). */
const SB_STATE: Record<(typeof STOP_QUESTIONS)[number] | (typeof BANG_QUESTIONS)[number], string> = {
  snoring: "sb_snoring",
  tiredness: "sb_tiredness",
  observed_apnea: "sb_observed_apnea",
  pressure: "sb_pressure",
  bmi_over_35: "sb_bmi_over_35",
  age_over_50: "sb_age_over_50",
  neck_circumference_over_40cm: "sb_neck_over_40",
  is_male: "sb_is_male",
};
/** A measurement as printed on the form: one decimal, dropped when whole, decimal comma except for English. */
export function formatMeasure(value: number, locale: string): string {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return locale === "en" ? text : text.replace(".", ",");
}

/** Whole years between a "YYYY-MM-DD" birth date and `today` (read as text: no time-zone shift). */
export function ageOn(birthDate: string, today: Date): number {
  const [y, m, d] = birthDate.split("-").map(Number) as [number, number, number];
  const ty = today.getUTCFullYear(), tm = today.getUTCMonth() + 1, td = today.getUTCDate();
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/**
 * The patient's recorded gender ticks its box (NEO-253). Only with no gender on
 * record does a STOP-Bang "G" = yes stand in for Hombre; a "no" to G is not read as Mujer.
 */
function sexChoice(options: string[], gender: string | null, screening: StopBangRecord | null): ChoiceField {
  const box = gender ? SEX_BOX[gender] : screening?.is_male ? SEX_BOX.male : undefined;
  return box === undefined ? options : { options, selected: options[box]! };
}

export function historiaClinicaPrintFields(locale: string, input: HistoriaClinicaInput): HistoriaClinicaPrint {
  const { history, oral, tmj, screening } = input;
  const states: Record<string, string> = {};
  const sexOptions = [documentT(locale, "documents.historiaEndo.sex.female"), documentT(locale, "documents.historiaEndo.sex.male"), documentT(locale, "documents.historiaEndo.sex.other")];
  const fields: Record<string, string> = {
    telefono: input.patientPhone ?? "",
    email: input.patientEmail ?? "",
    edad: input.birthDate ? documentT(locale, "documents.historiaEndo.ageYears", { n: String(ageOn(input.birthDate, input.today)) }) : "",
    expediente: "",
    score_zone_label: "",
    tmj_count_right: "",
    tmj_count_left: "",
    oral_findings_count: "",
    bmi_value: "",
    weight_value: "",
    height_value: "",
    neck_value: "",
  };
  const choices: Record<string, ChoiceField> = {
    sexo: sexChoice(sexOptions, input.gender, screening),
    dq_blank: YES_NO,
  };

  if (screening) {
    for (const [column, key] of Object.entries(SB_STATE)) states[key] = screening[column as keyof typeof SB_STATE] ? "on" : "off";
    if (screening.score != null) {
      const zone = screening.score >= 5 ? "high" : screening.score >= 3 ? "intermediate" : "low";
      states.score_state = String(screening.score);
      states.score_zone_state = zone;
      fields.score_zone_label = documentT(locale, `documents.stopBang.risk.${zone}`);
    }
    if (screening.bmi != null) fields.bmi_value = formatMeasure(screening.bmi, locale);
    if (screening.weight_kg != null) fields.weight_value = `${formatMeasure(screening.weight_kg, locale)} kg`;
    if (screening.height_cm != null) fields.height_value = `${formatMeasure(screening.height_cm, locale)} cm`;
    if (screening.neck_cm != null) fields.neck_value = `${formatMeasure(screening.neck_cm, locale)} cm`;
  }
  if (tmj) {
    for (const side of ["right", "left"] as const) {
      const count = String(TMJ_FINDINGS.filter((f) => tmj[`${f}_${side}`]).length);
      states[`tmj_level_${side}`] = count;
      fields[`tmj_count_${side}`] = count;
    }
  }
  if (oral) {
    const abnormalClass = oral.skeletal_class === "II" || oral.skeletal_class === "III" ? 1 : 0;
    fields.oral_findings_count = String(ORAL_FINDINGS.filter((q) => oral[q]).length + abnormalClass);
  }
  if (history) {
    states.habit_smoking = history.has_smoking ? "on" : "off";
    states.habit_alcohol = history.has_alcoholism ? "on" : "off";
  }
  return { fields, choices, states };
}
