/**
 * Line illustrations for the STOP-Bang questions (Łukasz, 2026-09-26: simple
 * in-house line icons in the brand teal, replaceable later). One 24×24 SVG
 * inner markup per question key; drawn with currentColor, round caps, no
 * fill — the caller sets size, color and stroke width. Keys match
 * config/questionnaires.ts STOP_QUESTIONS / BANG_QUESTIONS.
 */
export const STOP_BANG_ICONS: Record<string, string> = {
  // S — snoring: a sleeper's closed eye and a rising "z z"
  snoring: '<path d="M4 15.5c2.2-2 4.4-2 6.6 0s4.4 2 6.6 0"/><path d="M14 4h5l-5 5h5"/><path d="M8.5 7.5h3l-3 3h3"/>',
  // T — tiredness: a battery running low
  tiredness: '<rect x="3" y="8" width="15" height="9" rx="2"/><path d="M21 11v3"/><path d="M6 11v3"/>',
  // O — observed apnea: an eye watching
  observed_apnea: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
  // P — pressure: a gauge with a plus
  pressure: '<path d="M12 20a8 8 0 1 1 8-8"/><path d="M12 12l4-3"/><path d="M18 17h4M20 15v4"/>',
  // B — BMI: a bathroom scale
  bmi_over_35: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 10a3.5 3.5 0 0 1 7 0"/><path d="M12 10l1.5-1.5"/>',
  // A — age: a calendar
  age_over_50: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M9 15h6"/>',
  // N — neck: a measuring tape around a neck
  neck_circumference_over_40cm: '<path d="M8 3c0 5-1 7-4 9M16 3c0 5 1 7 4 9"/><path d="M6 15c4 2 8 2 12 0" stroke-dasharray="2 2"/>',
  // G — gender: the male symbol
  is_male: '<circle cx="10" cy="14" r="5"/><path d="M14 10l6-6M15 4h5v5"/>',
};

/** The STOP-Bang letter for a question key — the mnemonic the tool is named after. */
export const STOP_BANG_LETTERS: Record<string, string> = {
  snoring: "S",
  tiredness: "T",
  observed_apnea: "O",
  pressure: "P",
  bmi_over_35: "B",
  age_over_50: "A",
  neck_circumference_over_40cm: "N",
  is_male: "G",
};
