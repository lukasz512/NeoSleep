import type { FormFieldDef } from "../../types/formField";
import { useAuthStore } from "../../stores/auth";
import { identityFields } from "./identityFields";

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
 * Reuses the shared Identity block (prefix key overridden to "salutation",
 * matching patientForm.ts/hcpForm.ts's DB-layer naming convention).
 */

const identity = identityFields();
identity[0] = { ...identity[0], key: "salutation" };

export const leadFormFields: FormFieldDef[] = [
  ...identity,
  {
    key: "institution",
    type: "text",
    labelKey: "user.leads.form.institution",
    icon: "nav-hco",
    required: true,
    nestUnder: "metadata",
    cols: 12,
  },
  {
    key: "status",
    type: "select",
    labelKey: "user.leads.form.status",
    options: [
      { title: "user.leads.filters.statusNew", value: "new" },
      { title: "user.leads.filters.statusContacted", value: "contacted" },
      { title: "user.leads.filters.statusQualified", value: "qualified" },
      { title: "user.leads.filters.statusInactive", value: "inactive" },
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
