import type { FormFieldDef } from "../../types/formField";

/**
 * Presentation entity config for the generic FormRenderer (apps/pwa/src/
 * components/FormRenderer.vue + useFormRenderer.ts). Presentation is the
 * pilot for this config-driven pattern — unlike Lead/Practitioner/
 * Organization/Patient, it has no hand-authored PresentationForm.vue/
 * .types.ts/usePresentationForm.ts triad. All Presentation-specific
 * knowledge (fields, labels, validation, options) lives only in this file.
 */

// Basic URL-shape check — mirrors OrganizationForm's website validator
// leniency level (apps/pwa/src/composables/useOrganizationForm.ts's
// WEBSITE_REGEX): optional scheme, a host with at least one dot, optional
// path/query/fragment. Not a full RFC 3986 validator, just enough to catch
// an obvious typo before the value ends up as an <iframe>/<img> src in
// PresentationViewer.vue.
const FILE_URL_REGEX = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

function fileUrlRule(v: unknown): true | string {
  const s = String(v ?? "").trim();
  if (!s) return true; // required-ness is handled by the field's own `required` flag
  return FILE_URL_REGEX.test(s) || "user.presentations.form.validation.fileUrlInvalid";
}

// Active app locales (packages/i18n/{en,pl,mx}.json — see packages/i18n/
// loadLocale.ts's SupportedLocale). presentation.locale is a free-text
// column, not FK'd to a lookup table, so this is a fixed local list rather
// than a DB-driven one (same reasoning useOrganizationForm.ts documents for
// its own status list having no DB-driven lookup equivalent).
const LOCALE_OPTIONS = [
  { title: "app.language.en", value: "en" },
  { title: "app.language.pl", value: "pl" },
  { title: "app.language.mx", value: "mx" },
];

// DB CHECK constraint presentation_status_check — verified against
// infrastructure/db/schema-snapshot.sql (`CREATE TABLE neosleep.presentation`):
// CHECK (status = ANY (ARRAY['active', 'archived', 'draft'])).
const STATUS_OPTIONS = [
  { title: "user.presentations.filters.statusActive", value: "active" },
  { title: "user.presentations.filters.statusArchived", value: "archived" },
  { title: "user.presentations.filters.statusDraft", value: "draft" },
];

export const presentationFormFields: FormFieldDef[] = [
  {
    key: "title",
    type: "text",
    labelKey: "user.presentations.form.fieldTitle",
    required: true,
    cols: 12,
  },
  {
    // Plain URL text input — intentionally NOT a file-upload widget. There is
    // no multer/S3/storage infrastructure anywhere in this repo today;
    // presentations point at externally-hosted files (e.g. a CDN or shared
    // drive link). This is a deliberate scope boundary, not an oversight.
    key: "file_url",
    type: "text",
    labelKey: "user.presentations.form.fieldFileUrl",
    required: true,
    rules: [fileUrlRule],
    hint: "user.presentations.form.hintFileUrl",
    cols: 12,
  },
  {
    key: "thumbnail_url",
    type: "text",
    labelKey: "user.presentations.form.fieldThumbnailUrl",
    rules: [fileUrlRule],
    cols: 12,
  },
  {
    key: "locale",
    type: "select",
    labelKey: "user.presentations.form.fieldLocale",
    options: LOCALE_OPTIONS,
    default: "en",
    cols: 6,
  },
  {
    key: "status",
    type: "select",
    labelKey: "user.presentations.form.fieldStatus",
    options: STATUS_OPTIONS,
    default: "active",
    cols: 6,
  },
  {
    key: "tags",
    type: "chips",
    labelKey: "user.presentations.form.fieldTags",
    default: [],
    cols: 12,
  },
  {
    key: "keywords",
    type: "chips",
    labelKey: "user.presentations.form.fieldKeywords",
    default: [],
    cols: 12,
  },
];
