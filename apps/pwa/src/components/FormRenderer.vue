<template>
  <AppFormDialog
    ref="dialogRef"
    :model-value="modelValue"
    :title="formTitle"
    :avatar-entity-type="avatarEntityType"
    :avatar-name="avatarName"
    :avatar-first-name="String(form.first_name ?? '')"
    :avatar-last-name="String(form.last_name ?? '')"
    :folder="isFolder"
    :max-width="isFolder && mdAndUp ? 900 : undefined"
    @update:model-value="onDialogUpdate"
    @close="onCancelClick"
    @body-scroll="followScroll"
  >
    <VAlert
      v-if="verifyInfoKey"
      type="info"
      variant="tonal"
      density="comfortable"
      border="start"
      color="primary"
      border-color="primary"
      rounded="lg"
      class="mb-6"
    >
      {{ t(verifyInfoKey) }}
    </VAlert>
    <VForm ref="formRef" @submit.prevent="onSubmit">
      <section
        v-for="sec in sections"
        :key="sec.id"
        class="pwa-form-section"
        :class="{ 'pwa-form-section--titled': isFolder }"
        :data-section="sec.id"
        :aria-labelledby="isFolder ? `${uid}-${sec.id}` : undefined"
      >
      <h3 v-if="isFolder" :id="`${uid}-${sec.id}`" class="pwa-form-section__title">{{ sec.label }}</h3>
      <template v-for="(row, ri) in sec.rows" :key="ri">
        <div v-if="row.length > 1" class="pwa-form-row mb-3">
          <div v-for="f in row" :key="f.key" class="pwa-form-row-item pwa-form-col" :style="rowItemStyle(f)">
            <component
              :is="componentFor(f.type)"
              :ref="(el: unknown) => setFieldEl(f.key, el)"
              v-bind="fieldAttrs(f)"
            >
              <template v-if="f.icon" #prepend-inner>
                <button
                  v-if="f.icon === 'at'"
                  type="button"
                  class="pwa-email-at-btn"
                  :aria-label="t('app.identity.form.emailInsertAt')"
                  @mousedown.prevent="insertAtSign(f)"
                >
                  <AppIcon name="at" class="pwa-form-field-icon" />
                </button>
                <AppIcon v-else :name="f.icon" class="pwa-form-field-icon" />
              </template>
              <template v-if="f.avatarEntityType" #item="{ internalItem: item, props: itemProps }">
                <VListItem v-if="item.value" v-bind="itemProps" :title="item.title" :subtitle="item.raw.subtitle">
                  <template #prepend>
                    <AppAvatar :name="item.title" :entity-type="f.avatarEntityType" :size="item.raw.subtitle ? 36 : 28" />
                  </template>
                </VListItem>
              </template>
              <template v-if="f.avatarEntityType" #chip="{ internalItem: item, props: chipProps }">
                <VChip v-if="item.value" v-bind="chipProps" :text="resolvedChipTitle(f, item)" closable>
                  <template #prepend>
                    <AppSpinner v-if="chipIsLoading(f)" :size="14" :width="2" class="mr-1" />
                    <AppAvatar v-else :name="resolvedChipTitle(f, item)" :entity-type="f.avatarEntityType" :size="18" class="mr-1" />
                  </template>
                </VChip>
              </template>
              <template v-if="hasColorOptions(f)" #item="{ internalItem: item, props: itemProps }">
                <VListItem v-bind="itemProps" :title="undefined">
                  <VChip :color="chipColor(item.raw.color)" variant="tonal" size="small">{{ item.title }}</VChip>
                </VListItem>
              </template>
              <template v-if="hasColorOptions(f)" #chip="{ internalItem: item, props: chipProps }">
                <VChip v-bind="chipProps" :color="chipColor(item.raw.color)" variant="tonal" size="small">
                  {{ item.title }}
                </VChip>
              </template>
            </component>
          </div>
        </div>
        <div v-else class="mb-3">
          <component
            :is="componentFor(row[0].type)"
            :ref="(el: unknown) => setFieldEl(row[0].key, el)"
            v-bind="fieldAttrs(row[0])"
          >
            <template v-if="row[0].icon" #prepend-inner>
              <button
                v-if="row[0].icon === 'at'"
                type="button"
                class="pwa-email-at-btn"
                :aria-label="t('app.identity.form.emailInsertAt')"
                @mousedown.prevent="insertAtSign(row[0])"
              >
                <AppIcon name="at" class="pwa-form-field-icon" />
              </button>
              <AppIcon v-else :name="row[0].icon" class="pwa-form-field-icon" />
            </template>
            <template v-if="row[0].avatarEntityType" #item="{ internalItem: item, props: itemProps }">
              <VListItem v-if="item.value" v-bind="itemProps" :title="item.title" :subtitle="item.raw.subtitle">
                <template #prepend>
                  <AppAvatar :name="item.title" :entity-type="row[0].avatarEntityType" :size="item.raw.subtitle ? 36 : 28" />
                </template>
              </VListItem>
            </template>
            <template v-if="row[0].avatarEntityType" #chip="{ internalItem: item, props: chipProps }">
              <VChip v-if="item.value" v-bind="chipProps" :text="resolvedChipTitle(row[0], item)" closable>
                <template #prepend>
                  <AppSpinner v-if="chipIsLoading(row[0])" :size="14" :width="2" class="mr-1" />
                  <AppAvatar v-else :name="resolvedChipTitle(row[0], item)" :entity-type="row[0].avatarEntityType" :size="18" class="mr-1" />
                </template>
              </VChip>
            </template>
            <template v-if="hasColorOptions(row[0])" #item="{ internalItem: item, props: itemProps }">
              <VListItem v-bind="itemProps" :title="undefined">
                <VChip :color="chipColor(item.raw.color)" variant="tonal" size="small">{{ item.title }}</VChip>
              </VListItem>
            </template>
            <template v-if="hasColorOptions(row[0])" #chip="{ internalItem: item, props: chipProps }">
              <VChip v-bind="chipProps" :color="chipColor(item.raw.color)" variant="tonal" size="small">
                {{ item.title }}
              </VChip>
            </template>
          </component>
        </div>
      </template>
      </section>
    </VForm>

    <template v-if="isFolder" #spine>
      <FormFolderSpine
        :entity-type="avatarEntityType"
        :name="avatarName"
        :first-name="String(form.first_name ?? '')"
        :last-name="String(form.last_name ?? '')"
        :name-pending="t('app.formRenderer.namePending')"
        :details="spineDetails"
        :status="statusChip"
        :sections="indexSections"
        :active="activeSection"
        :index-label="t('app.formRenderer.sectionsLabel')"
        :changed-label="t('app.formRenderer.sectionChanged')"
        @select="goToSection"
      />
    </template>
    <template v-if="isFolder && !mdAndUp" #header-extra>
      <FormSectionChips
        :sections="indexSections"
        :active="activeSection"
        :index-label="t('app.formRenderer.sectionsLabel')"
        :changed-label="t('app.formRenderer.sectionChanged')"
        @select="goToSection"
      />
    </template>

    <template #actions>
      <span v-if="changedCount" class="pwa-form-dialog__changes" data-testid="form-changes" aria-live="polite">
        <span class="pwa-form-dialog__changes-dot" aria-hidden="true" />
        {{ t("app.formRenderer.unsavedChanges", { n: changedCount }) }}
      </span>
      <VSpacer />
      <AppButton variant="text" @click="onCancelClick">
        {{ t("app.common.cancel") }}
      </AppButton>
      <AppButton color="primary" variant="flat" :loading="submitting" @click="onSubmit">
        {{ formSubmitLabel }}
      </AppButton>
    </template>

    <template #overlays>
      <AppConfirmDialog
        v-model="showDiscardConfirm"
        :text="t('app.common.discardChanges')"
        :secondary-label="t('app.common.cancel')"
        :secondary-color="null"
        :primary-label="t('app.common.discard')"
        primary-color="error"
        primary-variant="text"
        max-width="360"
        @secondary="showDiscardConfirm = false"
        @primary="confirmDiscard"
      />
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useDisplay } from "vuetify";
import { useIdentity } from "../composables/useIdentity";
import FormFolderSpine, { type FormSpineSection } from "./FormFolderSpine.vue";
import FormSectionChips from "./FormSectionChips.vue";
import { VTextField, VSelect, VAutocomplete, VCombobox, VTextarea, VSwitch } from "vuetify/components";
import { useFormRenderer } from "../composables/useFormRenderer";
import { scrollToFormTop } from "../utils/scrollToFormTop";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";
import AppAvatar, { type AppAvatarEntityType } from "./AppAvatar.vue";
import AppSpinner from "./AppSpinner.vue";
import AppFormDialog from "./AppFormDialog.vue";
import AppConfirmDialog from "./AppConfirmDialog.vue";
import PhoneField from "./PhoneField.vue";
import EmailField from "./EmailField.vue";
import ChoiceChipsField from "./ChoiceChipsField.vue";
import type { FormDerive, FormFieldDef, FormFieldType } from "../types/formField";

/**
 * componentFor() below resolves to these imported component OBJECTS, never
 * bare name strings like "VTextField" — vite-plugin-vuetify auto-registers a
 * Vuetify component for an SFC only when it sees a literal <VTextField>-style
 * tag in that file's own template (static AST scan). This file only ever
 * referenced these components dynamically via `:is`, so none of them were
 * ever actually registered here — `<component :is="'VTextField'">` silently
 * failed to resolve (console: "Failed to resolve component"), rendering
 * nothing. Importing the real component avoids the name-lookup entirely.
 */

/**
 * Generic, config-driven form dialog. Renders one shared component from a
 * FormFieldDef[] array instead of a bespoke <Entity>Form.vue per entity —
 * see apps/pwa/src/types/formField.ts and useFormRenderer.ts for the contract.
 *
 * No entity-specific knowledge belongs in this file. Field lists, labels,
 * validation and option sources live only in a per-entity config object
 * under apps/pwa/src/config/forms/.
 */

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    fields: FormFieldDef[];
    initialData?: Record<string, unknown>;
    titleKey: string;
    editTitleKey?: string;
    submitLabelKey?: string;
    editSubmitLabelKey?: string;
    /** Entity-specific derived-fields hook — see useFormRenderer.ts's 3rd param. */
    derive?: FormDerive;
    /** i18n key for an info banner shown above the form (e.g. "verify this data"). */
    verifyInfoKey?: string;
    /** Shows an AppAvatar in the dialog header, live-previewing first/last name — opt-in, only for identity-based forms (hcp/lead/patient/user). */
    avatarEntityType?: AppAvatarEntityType;
  }>(),
  { modelValue: false },
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  /**
   * `done` must be called by the listener once its own async submit work
   * (the actual apiFetch call) settles — true closes the dialog, false
   * keeps it open (e.g. after a failed request) so the user can retry.
   */
  submit: [payload: Record<string, unknown>, done: (ok: boolean) => void];
}>();

const { t } = useI18n();

const initialDataRef = computed(() => props.initialData);
const {
  formRef, form, isEditMode,
  resolvedOptions, loadingOptions, loadAllAsyncOptions,
  rulesFor, validate, buildPayload,
  resetForm, hasChanged, changedKeys,
} = useFormRenderer(props.fields, initialDataRef, props.derive);
const { detailsFor } = useIdentity();

const submitting = ref(false);
const showDiscardConfirm = ref(false);

const formTitle = computed(() =>
  isEditMode.value && props.editTitleKey ? t(props.editTitleKey) : t(props.titleKey),
);
/** first_name/last_name for identity forms (hcp/lead/patient/user); a plain "name" field for org-style forms (hco). */
const avatarName = computed(() => {
  const fullName = [String(form.value.first_name ?? "").trim(), String(form.value.last_name ?? "").trim()]
    .filter(Boolean)
    .join(" ");
  return fullName || String(form.value.name ?? "").trim();
});
const formSubmitLabel = computed(() => {
  if (isEditMode.value) return t(props.editSubmitLabelKey ?? props.submitLabelKey ?? props.titleKey);
  return t(props.submitLabelKey ?? props.titleKey);
});

function isFieldHidden(f: FormFieldDef): boolean {
  return typeof f.hidden === "function" ? f.hidden(form.value) : !!f.hidden;
}

function labelFor(f: FormFieldDef): string {
  return t(typeof f.labelKey === "function" ? f.labelKey(form.value) : f.labelKey);
}

function colorFor(f: FormFieldDef): string | undefined {
  return typeof f.color === "function" ? f.color(form.value) : f.color;
}

function pairRows(fields: FormFieldDef[]): FormFieldDef[][] {
  const result: FormFieldDef[][] = [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    const next = fields[i + 1];
    const fCols = f.cols ?? 12;
    const nextCols = next?.cols ?? 12;
    if (fCols < 12 && nextCols < 12 && fCols + nextCols === 12) {
      result.push([f, next]);
      i += 2;
    } else {
      result.push([f]);
      i += 1;
    }
  }
  return result;
}

/**
 * Visible fields grouped by `section` (NEO-92), sections in the order of
 * their first field, so a config keeps its natural field order; a field
 * without one joins the first section. Pairing into rows happens per section.
 */
const sections = computed(() => {
  const groups = new Map<string, FormFieldDef[]>();
  const visible = props.fields.filter((f) => !isFieldHidden(f));
  const fallback = visible.find((f) => f.section)?.section ?? "default";
  for (const f of visible) {
    const id = f.section ?? fallback;
    groups.set(id, [...(groups.get(id) ?? []), f]);
  }
  return [...groups].map(([id, fields]) => ({
    id,
    label: t(`app.formRenderer.section.${id}`),
    fields,
    rows: pairRows(fields),
  }));
});

/** Two or more sections make the "Carpeta" folder: spine + section headings. Shorter forms stay one plain sheet. */
const isFolder = computed(() => sections.value.length >= 2);

// Desktop (≥ 960px) gets the spine; tablets (a tile) and phones (a bottom
// sheet) get the same index as a row of chips under the header.
const { mdAndUp } = useDisplay();
const uid = useId();

/**
 * Change markers (section dots + counter) are an edit-only feature (NEO-98):
 * on create every typed field is "new", so marking them is just noise. The
 * discard confirm on close still uses hasChanged() in both modes.
 */
const shownChangedKeys = computed(() => (isEditMode.value ? changedKeys.value : []));
const changedSet = computed(() => new Set(shownChangedKeys.value));
const changedCount = computed(() => shownChangedKeys.value.length);
const indexSections = computed<FormSpineSection[]>(() =>
  sections.value.map((s) => ({ id: s.id, label: s.label, changed: s.fields.some((f) => changedSet.value.has(f.key)) })),
);

/** The spine's detail line reads the live form over the record, so create and edit fill it the same way. */
const spineDetails = computed(() =>
  props.avatarEntityType
    ? detailsFor(props.avatarEntityType, { ...(props.initialData ?? {}), ...form.value })
    : { details: [], more: [] },
);

/** A `status` select with coloured options shows as the same tonal pill on the spine as in lists. */
const statusChip = computed(() => {
  const f = props.fields.find((x) => x.key === "status" && x.type === "select");
  if (!f) return null;
  const option = resolvedOptions(f).find((o) => o.value === form.value.status);
  return option?.color ? { label: option.title, color: chipColor(option.color) } : null;
});

// Scroll-spy: the active section is the last one whose top has passed the
// top of the sheet (plus a little slack); at the very bottom, the last one.
const dialogRef = ref<InstanceType<typeof AppFormDialog> | null>(null);
const activeSection = ref("");
const SPY_SLACK_PX = 48;

function sectionEls(body: HTMLElement): HTMLElement[] {
  return Array.from(body.querySelectorAll<HTMLElement>(".pwa-form-section[data-section]"));
}

let spyPausedUntil = 0;
let spyResume: ReturnType<typeof setTimeout> | undefined;

function followScroll(body: HTMLElement) {
  if (!isFolder.value) return;
  const wait = spyPausedUntil - performance.now();
  if (wait > 0) {
    // Catch up once the pause ends, in case the user scrolled meanwhile.
    clearTimeout(spyResume);
    spyResume = setTimeout(() => followScroll(body), wait + 20);
    return;
  }
  const els = sectionEls(body);
  if (!els.length) return;
  const top = body.getBoundingClientRect().top;
  const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 1 && body.scrollTop > 0;
  let current = els[0];
  for (const el of els) {
    if (el.getBoundingClientRect().top - top <= SPY_SLACK_PX) current = el;
  }
  activeSection.value = (atBottom ? els[els.length - 1] : current).dataset.section ?? "";
}

function goToSection(id: string) {
  const body = dialogRef.value?.bodyEl();
  const el = body ? sectionEls(body).find((s) => s.dataset.section === id) : undefined;
  if (!body || !el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const offset = el.getBoundingClientRect().top - body.getBoundingClientRect().top;
  // The first section scrolls back to the very top (its own padding included).
  const target = el === sectionEls(body)[0] ? 0 : body.scrollTop + offset - 16;
  // Hold the picked section while the smooth scroll passes the ones between.
  spyPausedUntil = reduce ? 0 : performance.now() + 600;
  body.scrollTo({ top: target, behavior: reduce ? "auto" : "smooth" });
  activeSection.value = id;
}

onBeforeUnmount(() => clearTimeout(spyResume));

watch(
  sections,
  (list) => {
    if (!list.some((s) => s.id === activeSection.value)) activeSection.value = list[0]?.id ?? "";
  },
  { immediate: true },
);

/**
 * Sets --pwa-form-col rather than `flex` directly — theme.scss's
 * .pwa-form-row-item reads it to build the flex-grow ratio (6/6 → 50/50,
 * 2/10 → ~17/83, independent of the row's actual pixel width or gap) above
 * its mobile breakpoint, and ignores it below that breakpoint to stack every
 * paired field to full width instead. An inline `style.flex` would win over
 * that media query regardless of specificity (inline always beats a
 * stylesheet rule short of `!important`), so the ratio has to travel as a
 * plain custom property instead.
 */
function rowItemStyle(f: FormFieldDef): Record<string, string> {
  const cols = f.cols ?? 6;
  return { "--pwa-form-col": String(cols), minWidth: cols <= 2 ? "72px" : "0" };
}

const fieldEls: Record<string, unknown> = {};
function setFieldEl(key: string, el: unknown) {
  if (el) fieldEls[key] = el;
  else delete fieldEls[key];
}

/** Inserts "@" at the caret in an email field's underlying input — a no-op once one is already present (an email has at most one). */
function insertAtSign(f: FormFieldDef) {
  const current = String(form.value[f.key] ?? "");
  if (current.includes("@")) return;
  const el = fieldEls[f.key] as { $el?: HTMLElement } | undefined;
  const inputEl = el?.$el?.querySelector("input") ?? undefined;
  const start = inputEl?.selectionStart ?? current.length;
  const end = inputEl?.selectionEnd ?? current.length;
  form.value[f.key] = current.slice(0, start) + "@" + current.slice(end);
  nextTick(() => {
    inputEl?.focus();
    // type="email" doesn't support the selection API — setSelectionRange
    // throws InvalidStateError there, so re-placing the caret is best-effort.
    try {
      inputEl?.setSelectionRange(start + 1, start + 1);
    } catch {
      // benign: unsupported input type for setSelectionRange — focus() above is enough.
    }
  });
}

/** A 'select' field whose options carry a `color` renders its value as a colored pill (see the #chip/#item slots above) instead of plain text. */
function hasColorOptions(f: FormFieldDef): boolean {
  return f.type === "select" && resolvedOptions(f).some((o) => !!o.color);
}

/** "default" means a neutral tonal chip with no color prop — VChip's own gray, not a theme color name. */
function chipColor(color?: string): string | undefined {
  return color && color !== "default" ? color : undefined;
}

/**
 * VCombobox resolves modelValue → selected item once, the first time that
 * value is seen — for an async-loaded field, that first pass almost always
 * happens before its `items` fetch has resolved, so it synthesizes a
 * fallback item whose title is just the raw stored value. Because that
 * resolution isn't re-run once `items` actually arrives (confirmed: the
 * chip stays wrong even after the fetch completes, and even across
 * closing/reopening the same dialog instance), `item.title` here can't be
 * trusted at all — this looks it up independently from `resolvedOptions`
 * by id every time, instead of ever trusting Vuetify's own (possibly
 * stale) title for the item. Falls back to a placeholder only for a value
 * that's genuinely absent from options (e.g. a soft-deleted clinic).
 * Returns "" while the options fetch is still in flight — see
 * chipIsLoading(), which swaps in a spinner for this same window — a raw
 * id must never be shown to the user, not even briefly.
 */
function resolvedChipTitle(f: FormFieldDef, item: { title: string; value: unknown }): string {
  if (loadingOptions.value[f.key]) return "";
  const match = resolvedOptions(f).find((o) => o.value === item.value);
  return match ? match.title : t("app.formRenderer.unresolvedOption");
}

/** Whether this chip's own name/title is still unresolved because its field's async options haven't loaded yet. */
function chipIsLoading(f: FormFieldDef): boolean {
  return !!loadingOptions.value[f.key];
}

/**
 * VCombobox (unlike VSelect/VAutocomplete) does not resolve through
 * itemValue when the user picks an item from its dropdown — it emits the
 * raw item object instead. Free-typed text (combobox's whole point) still
 * comes through as a plain string, so this only fires for a dropdown pick.
 * Without this unwrap, `{title, value}` was landing in form state — and
 * from there into the payload — as-is (e.g. identities.title getting saved
 * as the literal string `{"title":"Sra.","value":"Sra."}`).
 */
function normalizeFieldValue(f: FormFieldDef, v: unknown): unknown {
  if (f.type === "combobox" && v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return (v as { value: unknown }).value;
  }
  return v;
}

function componentFor(type: FormFieldType) {
  switch (type) {
    case "select": return VSelect;
    case "autocomplete": return VAutocomplete;
    case "chips": return VCombobox;
    case "combobox": return VCombobox;
    case "textarea": return VTextarea;
    case "phone": return PhoneField;
    case "email": return EmailField;
    case "boolean": return VSwitch;
    case "choice": return ChoiceChipsField;
    default: return VTextField;
  }
}

function fieldAttrs(f: FormFieldDef): Record<string, unknown> {
  const common: Record<string, unknown> = {
    modelValue: form.value[f.key],
    "onUpdate:modelValue": (v: unknown) => { form.value[f.key] = normalizeFieldValue(f, v); },
    label: labelFor(f),
    variant: "outlined",
    density: "comfortable",
    rules: rulesFor(f),
    hint: f.hint ? t(f.hint) : undefined,
    persistentHint: !!f.hint,
    placeholder: f.placeholder ? t(f.placeholder) : undefined,
    disabled: submitting.value || (!!f.immutableOnEdit && isEditMode.value),
    color: colorFor(f),
  };

  switch (f.type) {
    case "email":
      // EmailField owns type/autocomplete/icon/insert-@ internally now.
      return common;
    case "phone":
      return common;
    case "textarea":
      return { ...common, autoGrow: true, rows: 3 };
    case "number":
      return { ...common, type: "number" };
    case "select":
      // No menu-icon: at this width (often cols: 2/6, paired with another
      // field) the whole field is already the click target for its own menu —
      // the affix was pure visual weight, not a functional affordance.
      return {
        ...common,
        items: resolvedOptions(f),
        itemTitle: "title",
        itemValue: "value",
        menuIcon: "",
        chips: hasColorOptions(f),
      };
    case "combobox":
      return {
        ...common,
        items: resolvedOptions(f),
        itemTitle: "title",
        itemValue: "value",
        loading: !!loadingOptions.value[f.key],
        menuIcon: "",
        clearable: true,
      };
    case "autocomplete":
      return {
        ...common,
        items: resolvedOptions(f),
        itemTitle: "title",
        itemValue: "value",
        loading: !!loadingOptions.value[f.key],
        multiple: !!f.multiple,
        chips: !!f.multiple,
        closableChips: !!f.multiple,
      };
    case "chips":
      return { ...common, items: [], multiple: true, chips: true, closableChips: true };
    case "date":
      return { ...common, type: "date" };
    case "boolean":
      // Its own prop set, not spread from `common` — outlined-field props
      // (variant/rules/placeholder) don't apply to a switch.
      return {
        modelValue: !!form.value[f.key],
        "onUpdate:modelValue": (v: boolean) => {
          form.value[f.key] = v ? (f.trueValue ?? true) : (f.falseValue ?? false);
        },
        label: labelFor(f),
        color: "primary",
        density: "comfortable",
        // A switch has no validation message, so the details row is only
        // worth its space when the field carries a helper text (hint).
        hideDetails: !f.hint,
        hint: f.hint ? t(f.hint) : undefined,
        persistentHint: !!f.hint,
        disabled: submitting.value || (!!f.immutableOnEdit && isEditMode.value),
      };
    case "choice":
      // Chips, not an outlined input — only the props ChoiceChipsField takes.
      return {
        modelValue: form.value[f.key],
        "onUpdate:modelValue": (v: unknown) => { form.value[f.key] = v; },
        label: labelFor(f),
        items: resolvedOptions(f),
        rules: rulesFor(f),
        disabled: common.disabled,
      };
    case "text":
    default:
      return { ...common, autocomplete: "off" };
  }
}

function onDialogUpdate(value: boolean) {
  if (value === false && hasChanged()) {
    showDiscardConfirm.value = true;
  } else {
    emit("update:modelValue", value);
  }
}

function confirmDiscard() {
  showDiscardConfirm.value = false;
  emit("update:modelValue", false);
}

function onCancelClick() {
  if (hasChanged()) {
    showDiscardConfirm.value = true;
  } else {
    emit("update:modelValue", false);
  }
}

async function onSubmit() {
  const valid = await validate();
  if (!valid) {
    scrollToFormTop(formRef.value?.$el);
    return;
  }
  submitting.value = true;
  try {
    const payload = buildPayload();
    const ok = await new Promise<boolean>((resolve) => emit("submit", payload, resolve));
    if (ok) emit("update:modelValue", false);
  } finally {
    submitting.value = false;
  }
}

// Only the closed->open transition resets the form — deliberately NOT also
// watching initialData while already open. Every caller sets its selected/
// editing ref before flipping modelValue true, so initialData is already
// correct by then; re-triggering on a later initialData change (e.g. a
// detail view's post-save refetch, which runs after done() while the dialog
// is still technically open for one tick) used to blank the form and flash
// every required field red, since resetForm() re-seeds `form` from nothing.
watch(
  () => props.modelValue,
  (open, wasOpen) => {
    if (open && !wasOpen) {
      resetForm();
      activeSection.value = sections.value[0]?.id ?? "";
      loadAllAsyncOptions();
    }
  },
);

// Options for an already-open dialog (v-if-gated mount, matching every
// other form component's usage) must load once on creation too.
if (props.modelValue) loadAllAsyncOptions();
</script>

<!-- .pwa-form-dialog__*/.pwa-form-row* are shared, global classes — see assets/theme.scss -->
