import type { FormFieldDef } from "../../types/formField";
import { emailField } from "./identityFields";

/**
 * "Invite to collaborate" confirmation form — shown before sending a doctor-
 * type Lead a registration invite email (LeadsView.vue's inviteToPartner
 * action, POST /api/v1/lead/:id/invite). Prefilled from the Lead so staff can
 * correct a typo'd name/email before the invite goes out — same "verify
 * before converting" pattern as hcpForm.ts's moveToContacts flow — but the
 * doctor sets their own password/clinic data later, on the public
 * registration page, so no password/role/status fields belong here.
 */

export const partnerInviteFormFields: FormFieldDef[] = [
  {
    key: "first_name",
    type: "text",
    labelKey: "app.identity.form.firstName",
    required: true,
    cols: 6,
  },
  {
    key: "last_name",
    type: "text",
    labelKey: "app.identity.form.lastName",
    required: true,
    cols: 6,
  },
  emailField(),
];
