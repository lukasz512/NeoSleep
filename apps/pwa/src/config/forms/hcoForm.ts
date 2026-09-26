import type { FormFieldDef, FormFieldOption } from "../../types/formField";
import { useConfigStore } from "../../stores/config";
import { useAuthStore } from "../../stores/auth";
import { emailField } from "./identityFields";
import { loadTerritoryOptions } from "./territoryOptions";
import { PHONE_MIN_DIGITS, phoneDigitCount } from "../../utils/phone";

/**
 * Organization (HCO) entity config for the generic FormRenderer. No Identity
 * block here — an organization has no person. `status` is hidden for
 * everyone except admin (pending_approval is the record's real default,
 * non-admins never see/set it); `country_code` is always hidden, defaulted
 * to the creating user's own country. `email` reuses identityFields'
 * emailField() (not required here — an org's email is optional) so there is
 * exactly one email input style across the whole PWA.
 */

// Basic URL-shape check — accepts an optional scheme, a host with at least one
// dot, and an optional path/query/fragment. Shared between website/google_link.
const WEBSITE_REGEX = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

// DB CHECK constraint organization_status_check.
const STATUS_OPTIONS = [
  { title: "user.hco.filters.statusPendingApproval", value: "pending_approval" },
  { title: "user.hco.filters.statusActive", value: "active" },
  { title: "user.hco.filters.statusInactive", value: "inactive" },
];

function websiteRule(v: unknown): true | string {
  const s = String(v ?? "").trim();
  if (!s) return true;
  return WEBSITE_REGEX.test(s) || "user.hco.form.validation.websiteInvalid";
}

// Counts actual digits (matching the API's own `phone.replace(/\D/g, "")`
// check) rather than raw string length, so "+48123456" (8 digits after the
// area code) doesn't wrongly pass just because the "+" pads it to 9 chars.
function phoneMinDigitsRule(v: unknown): true | string {
  const s = String(v ?? "").trim();
  if (!s) return true;
  return phoneDigitCount(s) >= PHONE_MIN_DIGITS || "user.hco.form.validation.phoneMinDigits";
}

async function loadInstitutionTypeOptions() {
  const configStore = useConfigStore();
  if (configStore.options.organization_types.length === 0) {
    await configStore.loadOptions();
  }
  return configStore.institutionTypeItems;
}

/** Base specialty vocabulary plus any already picked on this org (edit mode),
 *  so previously-saved values are never dropped from the chips list. */
async function loadSpecialtyOptions(form: Record<string, unknown>): Promise<FormFieldOption[]> {
  const configStore = useConfigStore();
  if (configStore.options.specialties.length === 0) {
    await configStore.loadOptions();
  }
  const base = configStore.specialtyItems;
  const own = Array.isArray(form.specialties) ? (form.specialties as string[]) : [];
  const extra = own.filter((v) => !base.some((o) => o.value === v));
  return [...base, ...extra.map((v) => ({ title: v, value: v }))];
}

export const hcoFormFields: FormFieldDef[] = [
  { key: "name", type: "text", labelKey: "user.hco.form.name", required: true, cols: 12 },
  { key: "type", type: "select", labelKey: "user.hco.form.type", options: loadInstitutionTypeOptions, cols: 6 },
  {
    key: "specialties",
    type: "autocomplete",
    labelKey: "user.hco.form.specialties",
    options: loadSpecialtyOptions,
    multiple: true,
    cols: 6,
  },
  { key: "address_line1", type: "text", labelKey: "user.hco.form.addressLine1", cols: 12 },
  { key: "postal_code", type: "text", labelKey: "user.hco.form.postalCode", cols: 6 },
  { key: "city", type: "text", labelKey: "user.hco.form.city", cols: 6 },
  { key: "state", type: "text", labelKey: "user.hco.form.state", cols: 6 },
  {
    key: "territory_id",
    type: "autocomplete",
    labelKey: "user.hco.form.territory",
    default: null,
    options: loadTerritoryOptions,
    icon: "nav-territories",
    cols: 6,
  },
  {
    key: "country_code",
    type: "text",
    labelKey: "user.hco.form.countryCode",
    hidden: true,
    default: () => useAuthStore().user?.country_code ?? "",
  },
  {
    key: "phone",
    type: "phone",
    labelKey: "user.hco.form.phone",
    icon: "phone",
    rules: [phoneMinDigitsRule],
    cols: 12,
  },
  { ...emailField(false), labelKey: "user.hco.form.email" },
  {
    key: "website",
    type: "text",
    labelKey: "user.hco.form.website",
    icon: "globe",
    rules: [websiteRule],
    cols: 12,
  },
  {
    key: "google_link",
    type: "text",
    labelKey: "user.hco.form.googleLink",
    icon: "map-pin",
    rules: [websiteRule],
    cols: 12,
  },
  {
    key: "status",
    type: "select",
    labelKey: "user.hco.form.status",
    options: STATUS_OPTIONS,
    default: "active",
    hidden: () => useAuthStore().user?.role !== "admin",
    cols: 12,
  },
  {
    // NEO-79: whether this clinic is listed on the public website's
    // find-a-specialist map (organization.show_on_public_map, migration 033).
    // Admin-only, like status — the API also ignores the value from any
    // other role, since the form submits it with every save.
    key: "show_on_public_map",
    type: "boolean",
    labelKey: "user.hco.form.showOnPublicMap",
    hint: "user.hco.form.showOnPublicMapHint",
    default: true,
    hidden: () => useAuthStore().user?.role !== "admin",
    cols: 12,
  },
];
