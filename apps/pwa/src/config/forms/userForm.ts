import type { FormFieldDef } from "../../types/formField";
import { useConfigStore } from "../../stores/config";
import { useAuthStore } from "../../stores/auth";
import { identityFields } from "./identityFields";
import { loadScopeTerritoryOptions } from "./territoryOptions";

// A user's own RBAC access scope (territory_id field below) is coarse — a
// country, or everywhere — see requireScope.ts. Not the same field as
// `region` (that's the person's own location, identities.region, same
// concept as Patient/HCP's own region — purely descriptive, no
// access-control meaning).

/**
 * Staff user entity config for the generic FormRenderer (apps/pwa/src/
 * components/FormRenderer.vue + useFormRenderer.ts).
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

// 'doctor' is listed so an existing doctor user (created via the partner-
// invite pipeline, ADR-014) always renders/selects with a real i18n label
// ("Doctor") here instead of Vuetify falling back to the raw stored string —
// but the backend (commands/users.ts VALID_ROLES) still refuses to assign
// 'doctor' as a *new* value on any other user through this form; that stays
// exclusive to the partner-invite/HCP-training-finished flows.
//
// A STATIC array on purpose, not an async loader: the "edit" FormRenderer
// instance in UsersView.vue is a single persistent dialog reused for every
// user opened, and useFormRenderer's async-options cache loads a function-
// based `options` loader once and never re-runs it for a later record — a
// dynamic per-record loader here previously left 'doctor' missing for every
// edit after the first. Static options are re-resolved (via t()) on every
// render instead, so this has no such staleness problem. Legacy 'kam'/'msl'
// rows aren't listed (no live rows hold them, per product decision) and
// would still show as a raw value if one is ever found — a known, accepted
// gap, not this bug.
const ROLE_OPTIONS = [
  { title: "user.users.role.admin", value: "admin" },
  { title: "user.users.role.manager", value: "manager" },
  { title: "user.users.role.doctor", value: "doctor" },
  { title: "user.users.role.rep", value: "rep" },
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
    section: "access",
    type: "select",
    labelKey: "user.users.form.fieldRole",
    options: ROLE_OPTIONS,
    default: "rep",
    required: true,
    // Only admin can change (or set, on create) a user's role — mirrors
    // hcoForm.ts's own admin-only 'status' field. The backend
    // (commands/users.ts) is the real enforcement boundary; this only keeps
    // a non-admin from seeing a control they can't use.
    hidden: () => useAuthStore().user?.role !== "admin",
    cols: 6,
  },
  {
    key: "region",
    section: "territory",
    type: "autocomplete",
    labelKey: "user.users.form.fieldRegion",
    options: loadRegionOptions,
    cols: 6,
  },
  {
    key: "territory_id",
    section: "territory",
    type: "autocomplete",
    labelKey: "user.users.form.fieldTerritory",
    hint: "user.users.form.fieldTerritoryHint",
    default: null,
    options: loadScopeTerritoryOptions,
    icon: "nav-territories",
    cols: 6,
  },
  {
    key: "status",
    section: "access",
    type: "select",
    labelKey: "user.users.form.fieldStatus",
    options: STATUS_OPTIONS,
    default: "active",
    cols: 6,
  },
];
