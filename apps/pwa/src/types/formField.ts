/**
 * Generic, config-driven form field contract.
 *
 * This is the shared contract behind FormRenderer.vue / useFormRenderer.ts —
 * instead of hand-authoring a bespoke <Entity>Form.vue + .types.ts +
 * use<Entity>Form.ts triad per entity (the pattern used for Lead/Practitioner/
 * Organization/Patient), an entity describes its create/edit form as a plain
 * array of FormFieldDef and hands it to the shared <FormRenderer>. This
 * directly extends the already-accepted pattern of `pcf_template` storing
 * form schema in DB/config rather than in hand-written code.
 *
 * Keep this file free of any entity-specific knowledge — field lists, labels,
 * validation, and option sources for a given entity live in
 * apps/pwa/src/config/forms/<entity>Form.ts, never here.
 */

// Named type-only re-exports aren't resolvable from a `*.vue` module's ambient
// declaration (only the default export is declared there) — extract the
// prop's type via the component's instance type instead, which IS visible
// through the default export.
import type AppIcon from "../components/AppIcon.vue";
type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

/** Supported input types the renderer knows how to draw. */
export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "number"
  | "select"
  | "autocomplete"
  | "chips"
  | "combobox"
  | "date";

/**
 * One selectable option for 'select'/'autocomplete'/'combobox' fields.
 *
 * `title` means different things depending on where the option came from:
 * - In a **static** array (e.g. a status/locale dropdown baked into a config
 *   file), `title` is an i18n KEY — FormRenderer resolves it via t(), the
 *   same convention as `labelKey`. This keeps entity config files plain,
 *   locale-agnostic data with no dependency on a translator function.
 * - In options returned by an **async loader** (e.g. practitioner/organization
 *   names fetched from the API, mirroring useEventForm.ts's loadHcp()),
 *   `title` is already the final display string and is used as-is, never
 *   passed through t() — it's real data, not a translation key.
 */
export interface FormFieldOption {
  title: string;
  value: unknown;
}

/**
 * A field-level validation rule. Return `true` when valid, or an i18n KEY
 * (not a literal message) when invalid — FormRenderer resolves the key via
 * `t()` at render time, so config files never need access to a translator.
 */
export type FormFieldRule = (v: unknown) => true | string;

export interface FormFieldDef {
  /** Payload field name — also the key form state is stored/read under. */
  key: string;
  /** Which Vuetify input the renderer draws. */
  type: FormFieldType;
  /** i18n key for the field label — resolved via t(), never hardcoded English. */
  labelKey: string;
  /** When true, the renderer adds a generic "required" rule automatically. */
  required?: boolean;
  /** Extra validation rules layered on top of the built-in required check. */
  rules?: FormFieldRule[];
  /**
   * Options for 'select'/'autocomplete'/'combobox' fields: a static array, or
   * an async loader function (e.g. "load practitioner options from the API",
   * the same shape as useEventForm.ts's loadHcp()/loadHco()). The loader
   * receives the current form state so a field can depend on a sibling field's
   * value (see `dependsOn`). Loaders are called once per dialog open (or on a
   * `dependsOn` change) and cached.
   */
  options?: FormFieldOption[] | ((form: Record<string, unknown>) => Promise<FormFieldOption[]>);
  /** Allow multiple selections — only meaningful for type 'autocomplete'. */
  multiple?: boolean;
  /**
   * Value used to seed the field when there is no initialData for it. A
   * function is invoked fresh every time the form (re)builds its state (i.e.
   * on every dialog open), so it can read live context at that moment, e.g.
   * `default: () => useAuthStore().user?.country_code`.
   */
  default?: unknown | (() => unknown);
  /** i18n key for optional helper text shown under the field. */
  hint?: string;
  /** i18n key for placeholder text shown inside an empty field (e.g. "example@mail.com"). */
  placeholder?: string;
  /** Icon rendered in the input's #prepend-inner slot when set. */
  icon?: AppIconName;
  /**
   * Skip rendering this field's row, while keeping it in the field list for
   * state/validation/payload purposes (e.g. an admin-only field, or a value
   * silently inherited from another field). A function is re-evaluated
   * whenever the form re-renders, so it can react to e.g. the current user's
   * role — `hidden: () => useAuthStore().user?.role !== "admin"`.
   */
  hidden?: boolean | (() => boolean);
  /**
   * Field keys whose value changes invalidate this field's cached options and
   * force a reload (e.g. a specialty picker whose options depend on the
   * currently selected clinic).
   */
  dependsOn?: string[];
  /**
   * After a `dependsOn`-triggered options reload resolves, if this field is
   * still empty, seed it with the first resolved option's value.
   */
  autoSelectFirstIfEmpty?: boolean;
  /**
   * When set, this field's value actually lives at `payload[nestUnder][key]`
   * / `initialData[nestUnder][key]` instead of a flat `payload[key]` — e.g.
   * social-media fields nested under `social_links`, or a freetext field
   * nested under `metadata`. Applies symmetrically on read and write.
   *
   * Known limitation: writes always replace `payload[nestUnder]` wholesale —
   * this is fine as long as each nested bucket has exactly one writer in the
   * form (true for every current use); it is not a merge with what's already
   * stored in that DB column.
   */
  nestUnder?: string;
  /**
   * Layout width hint, out of a 12-unit row (like OrganizationForm/PatientForm's
   * 2-column rows). A field pairs with the next visible field into one
   * .pwa-form-row when the two `cols` values add up to 12 — each gets that
   * share of the row's width (`6`+`6` → 50/50, `2`+`10` → narrow/wide, e.g.
   * identityFields' prefix+first name). Omit (or `12`) for a full-width field
   * on its own row. Hidden fields are filtered out before pairing, so a
   * `cols: 6` field whose intended partner is hidden will pair with the next
   * visible field whose `cols` completes it to 12.
   */
  cols?: 2 | 6 | 10 | 12;
}
