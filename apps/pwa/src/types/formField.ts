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
  | "date";

/**
 * One selectable option for 'select'/'autocomplete' fields.
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
   * Options for 'select'/'autocomplete' fields: a static array, or an async
   * loader function (e.g. "load practitioner options from the API", the same
   * shape as useEventForm.ts's loadHcp()/loadHco()). Loaders are called once
   * per dialog open and cached.
   */
  options?: FormFieldOption[] | (() => Promise<FormFieldOption[]>);
  /** Allow multiple selections — only meaningful for type 'autocomplete'. */
  multiple?: boolean;
  /** Value used to seed the field when there is no initialData for it. */
  default?: unknown;
  /** i18n key for optional helper text shown under the field. */
  hint?: string;
  /**
   * Layout width hint. `6` pairs this field with an adjacent `cols: 6` field
   * into one .pwa-form-row (half-width each, like OrganizationForm/PatientForm's
   * 2-column rows). Omit (or `12`) for a full-width field on its own row.
   */
  cols?: 6 | 12;
}
