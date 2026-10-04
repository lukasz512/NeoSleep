/**
 * Where a row of the cross-patient clinical lists lands in the patient view (NEO-222):
 * an Estudios row opens that study on the Estudios tab, a Tratamientos row the Dispositivo tab.
 */
export function sleepStudyDetailQuery(item: Record<string, unknown>): Record<string, string> {
  return typeof item.id === "string" ? { tab: "studies", study: item.id } : { tab: "studies" };
}

export function treatmentPlanDetailQuery(_item: Record<string, unknown>): Record<string, string> {
  return { tab: "orthoapnea" };
}
