import { describe, it, expect } from "vitest";
import { historiaClinicaPrintFields, ageOn } from "./historiaClinicaPrint.js";
import type { MedicalHistoryRecord, OralExamRecord, StopBangRecord, TmjExamRecord } from "../db/clinicalRecords.js";

const TODAY = new Date("2026-10-05T12:00:00Z");

const screening = {
  snoring: true,
  tiredness: true,
  observed_apnea: false,
  pressure: true,
  bmi_over_35: false,
  age_over_50: true,
  neck_circumference_over_40cm: false,
  is_male: false,
  bmi: 29.4,
  height_cm: 162,
  weight_kg: 77,
  neck_cm: 38,
  score: 4,
} as unknown as StopBangRecord;

const tmj = {
  pain_palpation_right: true,
  pain_palpation_left: false,
  joint_sounds_right: true,
  joint_sounds_left: true,
  opening_limitation_right: false,
  opening_limitation_left: false,
  opening_deviation_right: false,
  opening_deviation_left: false,
  muscle_pain_right: false,
  muscle_pain_left: false,
  max_opening_mm: 38,
} as unknown as TmjExamRecord;

const oral = {
  has_bruxism: true,
  has_narrow_palate: true,
  has_geographic_tongue: false,
  has_xerostomia: false,
  is_mouth_breather: true,
  has_missing_teeth: false,
  has_periodontal_disease: false,
  has_tmj_finding: true, // retired question (migration 049): never counted
  skeletal_class: "II",
} as unknown as OralExamRecord;

const history = { has_smoking: true, has_alcoholism: false } as unknown as MedicalHistoryRecord;

describe("historiaClinicaPrintFields", () => {
  it("a recorded patient: gauge, zone, skull levels per side, findings count and measures", () => {
    const { fields, states } = historiaClinicaPrintFields("mx", { patientPhone: "55 1234 5678", patientEmail: "ana@example.mx", birthDate: "1971-03-14", gender: null, today: TODAY, history, oral, tmj, screening });
    expect(states.score_state).toBe("4");
    expect(states.score_zone_state).toBe("intermediate");
    expect(fields.score_zone_label).toContain("Riesgo intermedio");
    expect([states.tmj_level_right, states.tmj_level_left]).toEqual(["2", "1"]);
    expect([fields.tmj_count_right, fields.tmj_count_left]).toEqual(["2", "1"]);
    expect(fields.oral_findings_count).toBe("4"); // 3 yes + skeletal class II
    expect(fields.bmi_value).toBe("29,4");
    expect([fields.weight_value, fields.height_value, fields.neck_value]).toEqual(["77 kg", "162 cm", "38 cm"]);
    expect(fields.edad).toBe("55 años");
    expect([fields.telefono, fields.email]).toEqual(["55 1234 5678", "ana@example.mx"]);
  });

  it("STOP-Bang answers and habits become ticked boxes; a 'no' stays an empty box", () => {
    const { states } = historiaClinicaPrintFields("mx", { patientPhone: null, patientEmail: null, birthDate: null, gender: null, today: TODAY, history, oral, tmj, screening });
    expect(states.sb_snoring).toBe("on");
    expect(states.sb_observed_apnea).toBe("off");
    expect(states.sb_neck_over_40).toBe("off");
    expect(states.habit_smoking).toBe("on");
    expect(states.habit_alcohol).toBe("off");
  });

  it("a blank form (nothing recorded): no needle, no levels, no counts, every box empty", () => {
    const { fields, states, choices } = historiaClinicaPrintFields("mx", { patientPhone: null, patientEmail: null, birthDate: null, gender: null, today: TODAY, history: null, oral: null, tmj: null, screening: null });
    expect(states).toEqual({});
    expect(fields.oral_findings_count).toBe("");
    expect(fields.tmj_count_right).toBe("");
    expect(fields.edad).toBe("");
    expect([fields.telefono, fields.email]).toEqual(["", ""]); // write-in lines
    expect(choices.sexo).toEqual(["Mujer", "Hombre", "Otro"]);
    expect(choices.dq_blank).toEqual(["Sí", "No"]);
  });

  it("sex is only marked when the record says male; a 'no' to G is not assumed to mean female", () => {
    const male = historiaClinicaPrintFields("mx", { patientPhone: null, patientEmail: null, birthDate: null, gender: null, today: TODAY, history: null, oral: null, tmj: null, screening: { ...screening, is_male: true } as StopBangRecord });
    expect(male.choices.sexo).toEqual({ options: ["Mujer", "Hombre", "Otro"], selected: "Hombre" });
    const notMale = historiaClinicaPrintFields("mx", { patientPhone: null, patientEmail: null, birthDate: null, gender: null, today: TODAY, history: null, oral: null, tmj: null, screening });
    expect(notMale.choices.sexo).toEqual(["Mujer", "Hombre", "Otro"]);
  });
  it("the patient's recorded gender ticks its Sexo box, ahead of the STOP-Bang G answer (NEO-253)", () => {
    const base = { patientPhone: null, patientEmail: null, birthDate: null, today: TODAY, history: null, oral: null, tmj: null };
    const sexOf = (gender: string | null, s: StopBangRecord | null = null) => historiaClinicaPrintFields("mx", { ...base, gender, screening: s }).choices.sexo;
    expect(sexOf("female")).toEqual({ options: ["Mujer", "Hombre", "Otro"], selected: "Mujer" });
    expect(sexOf("male")).toEqual({ options: ["Mujer", "Hombre", "Otro"], selected: "Hombre" });
    expect(sexOf("other")).toEqual({ options: ["Mujer", "Hombre", "Otro"], selected: "Otro" });
    expect(sexOf("prefer_not_to_say")).toEqual(["Mujer", "Hombre", "Otro"]);
    expect(sexOf("female", { ...screening, is_male: true } as StopBangRecord)).toEqual({ options: ["Mujer", "Hombre", "Otro"], selected: "Mujer" });
  });
});

describe("ageOn", () => {
  it("counts whole years, the birthday itself included", () => {
    expect(ageOn("1971-03-14", TODAY)).toBe(55);
    expect(ageOn("1971-10-05", TODAY)).toBe(55);
    expect(ageOn("1971-10-06", TODAY)).toBe(54);
  });
});
