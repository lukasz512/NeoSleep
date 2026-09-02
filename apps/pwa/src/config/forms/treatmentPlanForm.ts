import type { FormFieldDef, FormFieldOption } from "../../types/formField";
import { apiFetch } from "../../composables/useApi";

/**
 * OrthoApnea treatment plan edit form — covers the dental_appliance path
 * only (dentist, 3D scan, appliance fulfillment dates). Does NOT submit any
 * order to the OrthoApnea partner API — this form only writes the local
 * treatment_plan row (see apps/api/src/commands/treatmentPlan.ts).
 */

const STATUS_OPTIONS: FormFieldOption[] = [
  { title: "app.treatmentPlans.status.initiated", value: "initiated" },
  { title: "app.treatmentPlans.status.patientNotified", value: "patient_notified" },
  { title: "app.treatmentPlans.status.inProgress", value: "in_progress" },
  { title: "app.treatmentPlans.status.completed", value: "completed" },
  { title: "app.treatmentPlans.status.cancelled", value: "cancelled" },
  { title: "app.treatmentPlans.status.onHold", value: "on_hold" },
];

async function loadDentistOptions(): Promise<FormFieldOption[]> {
  const res = await apiFetch("/api/v1/practitioner?limit=-1", { handleErrors: false });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: { id: string; name: string }[] };
  return (json.items ?? []).map((p) => ({ title: p.name, value: p.id }));
}

export const treatmentPlanFormFields: FormFieldDef[] = [
  {
    key: "dentist_id",
    type: "autocomplete",
    labelKey: "app.treatmentPlans.form.dentist",
    default: null,
    options: loadDentistOptions,
    icon: "nav-hcp",
    avatarEntityType: "hcp",
    cols: 12,
  },
  { key: "appointment_at", type: "date", labelKey: "app.treatmentPlans.form.appointmentAt", cols: 6 },
  { key: "status", type: "select", labelKey: "app.treatmentPlans.form.status", options: STATUS_OPTIONS, default: "initiated", cols: 6 },
  { key: "scan_ordered_at", type: "date", labelKey: "app.treatmentPlans.form.scanOrderedAt", cols: 6 },
  { key: "scan_received_at", type: "date", labelKey: "app.treatmentPlans.form.scanReceivedAt", cols: 6 },
  { key: "scan_file_url", type: "text", labelKey: "app.treatmentPlans.form.scanFileUrl", cols: 12 },
  { key: "appliance_ordered_at", type: "date", labelKey: "app.treatmentPlans.form.applianceOrderedAt", cols: 6 },
  { key: "appliance_delivered_at", type: "date", labelKey: "app.treatmentPlans.form.applianceDeliveredAt", cols: 6 },
  { key: "notes", type: "textarea", labelKey: "app.treatmentPlans.form.notes", cols: 12 },
];
