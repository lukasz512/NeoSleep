/**
 * Single source for OrthoApnea treatment-plan status → chip color/label, shared
 * by PatientOrthoApneaPanel (Device tab) and PatientAsidePanel (NEO-153).
 */
export function treatmentPlanStatusColor(status: string): string {
  switch (status) {
    case "completed": return "success";
    case "in_progress":
    case "patient_notified": return "info";
    case "cancelled": return "default";
    case "on_hold": return "warning";
    default: return "warning";
  }
}

export function treatmentPlanStatusLabel(t: (key: string) => string, status: string): string {
  return t(`app.treatmentPlans.status.${status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`);
}

/** A plan saved locally from the order wizard but never sent to OrthoApnea (see OrthoApneaOrderWizard.persistDraft). */
export function isDraftTreatmentPlan(plan: { metadata: Record<string, unknown> | null }): boolean {
  return !!plan.metadata?.orthoapneaDraft;
}
