/**
 * Single source for patient status → color/label, shared by PatientsView.vue's
 * list chip and PatientDetailView.vue's detail tab (previously two independent
 * switch statements that had drifted — the detail view rendered plain text with
 * no color at all).
 */
export function patientStatusColor(status?: string): string {
  switch (status) {
    case "active":     return "success";
    case "follow_up":  return "warning";
    case "discharged": return "default";
    default:           return "default";
  }
}

export function patientStatusLabel(t: (key: string, ...params: unknown[]) => string, status?: string): string {
  switch (status) {
    case "active":     return t("app.patients.filters.statusActive");
    case "follow_up":  return t("app.patients.filters.statusFollowUp");
    case "discharged": return t("app.patients.filters.statusDischarged");
    default:           return status ?? "";
  }
}
