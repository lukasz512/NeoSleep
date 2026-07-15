import type { FormFieldDef } from "../../types/formField";
import { useConfigStore } from "../../stores/config";

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
 * `email` stays in the field list for create, but UpdateUserCommand ignores
 * it on edit (email isn't editable yet) — the field is harmlessly a no-op
 * when submitted from the edit dialog.
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

export const userFormFields: FormFieldDef[] = [
  {
    key: "first_name",
    type: "text",
    labelKey: "user.users.form.fieldFirstName",
    required: true,
    cols: 6,
  },
  {
    key: "last_name",
    type: "text",
    labelKey: "user.users.form.fieldLastName",
    required: true,
    cols: 6,
  },
  {
    key: "email",
    type: "email",
    labelKey: "user.users.form.fieldEmail",
    required: true,
    cols: 12,
  },
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
    key: "phone",
    type: "phone",
    labelKey: "user.users.form.fieldPhone",
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
