import type { FormFieldDef } from "../../types/formField";
import { useAuthStore } from "../../stores/auth";
import { identityFields } from "./identityFields";
import { i18n } from "../../plugins/i18n";

/**
 * Lead entity config for the generic FormRenderer. A Lead is deliberately
 * "dirty"/unqualified data — nothing here creates or links a real
 * Organization (HCO). `institution` is a plain string, nested under
 * `metadata.institution` (see apps/api/src/commands/lead.ts) — a future
 * "convert lead" step is what turns it into a real HCO/HCP, not this form.
 *
 * `status`/`region` are silently defaulted rather than surfaced as controls
 * (lead.region is NOT NULL in the DB) — the create/edit dialog only ever
 * shows Identity + organization name, per the "nothing else for now" scope.
 *
 * `institution` and `diagnosis` are mutually exclusive by `type`: a clinic
 * name only makes sense for a doctor lead, a suspected diagnosis only for a
 * patient lead — see isDoctorType()/isPatientType() below.
 *
 * Reuses the shared Identity block (prefix key overridden to "salutation",
 * matching patientForm.ts/hcpForm.ts's DB-layer naming convention).
 */

function isDoctorType(form: Record<string, unknown>): boolean {
  return form.type === "doctor";
}

function isPatientType(form: Record<string, unknown>): boolean {
  return form.type === "patient";
}

const identity = identityFields();
identity[0] = { ...identity[0], key: "salutation" };

export const leadFormFields: FormFieldDef[] = [
  ...identity,
  {
    key: "institution",
    type: "text",
    labelKey: "user.leads.form.institution",
    icon: "nav-hco",
    required: isDoctorType,
    hidden: isPatientType,
    nestUnder: "metadata",
    cols: 12,
  },
  {
    key: "diagnosis",
    type: "text",
    labelKey: "user.leads.form.diagnosis",
    icon: "nav-patients",
    hidden: (form) => !isPatientType(form),
    default: () => i18n.global.t("user.leads.form.diagnosisDefault"),
    nestUnder: "metadata",
    cols: 12,
  },
  {
    key: "type",
    type: "select",
    labelKey: "user.leads.filters.type",
    options: [
      { title: "user.leads.filters.typeDoctor", value: "doctor" },
      { title: "user.leads.filters.typeHospital", value: "hospital" },
      { title: "user.leads.filters.typePharmacy", value: "pharmacy" },
      { title: "user.leads.filters.typePatient", value: "patient" },
      { title: "user.leads.filters.typeOther", value: "other" },
    ],
    // Leads are doctor-only by definition now (see moveToDoctors/inviteToPartner's
    // type === 'doctor' gate in LeadDetailView.vue/LeadsView.vue) — was
    // defaulting to 'other', which silently hid both those actions on every
    // newly created lead until a rep manually switched the dropdown.
    default: "doctor",
    cols: 12,
  },
  {
    key: "status",
    type: "select",
    labelKey: "user.leads.form.status",
    options: [
      { title: "user.leads.filters.statusNew", value: "new" },
      { title: "user.leads.filters.statusContacted", value: "contacted" },
      { title: "user.leads.filters.statusFollowUpNeeded", value: "follow_up_needed" },
      { title: "user.leads.filters.statusMeetingScheduled", value: "meeting_scheduled" },
      { title: "user.leads.filters.statusDeclined", value: "declined" },
    ],
    default: "new",
    hidden: true,
  },
  {
    key: "region",
    type: "text",
    labelKey: "user.leads.form.region",
    default: () => useAuthStore().user?.region ?? "",
    hidden: true,
  },
];
