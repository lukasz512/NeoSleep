import type { FormFieldDef } from "../../types/formField";
import { useConfigStore } from "../../stores/config";
import { identityFields } from "./identityFields";

/**
 * Staff user entity config for the generic FormRenderer (apps/pwa/src/
 * components/FormRenderer.vue + useFormRenderer.ts). Used by UsersView.vue
 * (admin/manager user management — see routes/users.ts on the API side).
 *
 * No password field here: new accounts are created without a password —
 * ensureInitialUserPasswords() (apps/api/src/auth.ts) sets one on next
 * server startup, or an admin can immediately trigger the "reset password"
 * row action to email the new user a set-password link. Admins never
 * type/see another person's password.
 *
 * `email` is marked `immutableOnEdit` — FormRenderer disables it once
 * initialData.id is set, so the edit dialog no longer shows a live-looking
 * field that UpdateUserCommand silently ignores.
 *
 * Reuses the shared Identity block (prefix key overridden to "salutation",
 * matching patientForm.ts/hcpForm.ts's DB-layer naming convention).
 */

const ROLE_OPTIONS = [
  { title: "user.users.role.admin", value: "admin" },
  { title: "user.users.role.manager", value: "manager" },
  { title: "user.users.role.rep", value: "rep" },
  { title: "user.users.role.doctor", value: "doctor" },
];

const STATUS_OPTIONS = [
  { title: "user.users.status.active", value: "active" },
  { title: "user.users.status.inactive", value: "inactive" },
  { title: "user.users.status.suspended", value: "suspended" },
];

async function loadRegionOptions() {
  const configStore = useConfigStore();
  if (configStore.options.regions.length === 0) {
    await configStore.loadOptions();
  }
  return configStore.regionItems;
}

const identity = identityFields();
identity[0] = { ...identity[0], key: "salutation" };
identity[3] = { ...identity[3], immutableOnEdit: true };

export const userFormFields: FormFieldDef[] = [
  ...identity,
  {
    key: "role",
    type: "select",
    labelKey: "user.users.form.fieldRole",
    options: ROLE_OPTIONS,
    default: "rep",
    required: true,
    cols: 6,
  },
  {
    key: "region",
    type: "autocomplete",
    labelKey: "user.users.form.fieldRegion",
    options: loadRegionOptions,
    cols: 6,
  },
  {
    key: "status",
    type: "select",
    labelKey: "user.users.form.fieldStatus",
    options: STATUS_OPTIONS,
    default: "active",
    cols: 6,
  },
];
