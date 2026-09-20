/**
 * Mobile card "second line" formatters shared by the entity list views —
 * each one joins the same fields the desktop table already shows in
 * separate columns, so the `feed-card-meta` slot doesn't lose information
 * on mobile (NEO-19). Extracted out of the views themselves so this
 * formatting logic is unit-testable without mounting a full view.
 *
 * i18n lookups a formatter needs stay call-site-injected (`translate`,
 * `typeLabel`, `studyTypeLabel`) rather than importing `useI18n` here —
 * these are plain functions, not composables, so they can be unit tested
 * with a fake translator instead of the full vue-i18n/Vuetify test harness.
 */

export function hcpCardMeta(hcp: { institution?: string | null; territory_name?: string | null; region?: string | null }): string {
  return [hcp.institution, hcp.territory_name || hcp.region].filter(Boolean).join(" · ") || "—";
}

export function kindPascal(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function territoryCardMeta(
  territory: { kind: string; country_code?: string | null; code?: string | null },
  translate: (key: string) => string,
): string {
  const parts = [translate(`user.territories.form.kind${kindPascal(territory.kind)}`), territory.country_code];
  if (territory.code) parts.push(territory.code);
  return parts.filter(Boolean).join(" — ");
}

export function treatmentPlanCardMeta(
  plan: { type?: string; dentist_name?: string | null },
  typeLabel: (type?: string) => string,
): string {
  return [typeLabel(plan.type), plan.dentist_name].filter(Boolean).join(" · ") || "—";
}

export function sleepStudyCardMeta(
  study: { study_type?: string; study_date?: string | null; ahi_score?: number | null; interpreted_by_name?: string | null },
  studyTypeLabel: (studyType?: string) => string,
  translate: (key: string) => string,
): string {
  const date = study.study_date ? new Date(study.study_date).toLocaleDateString() : undefined;
  const ahi = study.ahi_score != null ? `${translate("app.sleepStudies.table.ahiScore")} ${study.ahi_score}` : undefined;
  return [studyTypeLabel(study.study_type), date, ahi, study.interpreted_by_name].filter(Boolean).join(" · ") || "—";
}
