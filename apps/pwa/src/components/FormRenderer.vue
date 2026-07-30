<template>
  <VDialog
    :model-value="modelValue"
    max-width="680"
    content-class="pwa-form-dialog__content"
    class="form-renderer-dialog"
    :transition="originDialogTransition"
    @update:model-value="onDialogUpdate"
  >
    <VCard class="pwa-form-dialog__card">
      <VCardTitle class="mx-2 mt-2 text-h6 pwa-form-dialog__title-row">
        <AppAvatar
          v-if="avatarEntityType"
          :name="avatarName"
          :entity-type="avatarEntityType"
          :size="40"
        />
        <span>{{ formTitle }}</span>
        <VSpacer />
        <AppButton
          icon
          variant="text"
          :title="t('app.common.close')"
          :aria-label="t('app.common.close')"
          @click="onCancelClick"
        >
          <AppIcon name="close" class="pwa-form-dialog__close-icon" />
        </AppButton>
      </VCardTitle>
      <VCardText>
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
          <template v-for="(row, ri) in rows" :key="ri">
            <div v-if="row.length > 1" class="pwa-form-row mb-3">
              <div v-for="f in row" :key="f.key" class="pwa-form-row-item" :style="rowItemStyle(f)">
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
                  <template v-if="f.avatarEntityType" #item="{ item, props: itemProps }">
                    <VListItem v-if="item.value" v-bind="itemProps" :title="item.title">
                      <template #prepend>
                        <AppAvatar :name="item.title" :entity-type="f.avatarEntityType" :size="28" />
                      </template>
                    </VListItem>
                  </template>
                  <template v-if="f.avatarEntityType" #chip="{ item, props: chipProps }">
                    <VChip v-if="item.value" v-bind="chipProps" :text="item.title" closable>
                      <template #prepend>
                        <AppAvatar :name="item.title" :entity-type="f.avatarEntityType" :size="18" class="mr-1" />
                      </template>
                    </VChip>
                  </template>
                  <template v-if="hasColorOptions(f)" #item="{ item, props: itemProps }">
                    <VListItem v-bind="itemProps" :title="undefined">
                      <VChip :color="chipColor(item.raw.color)" variant="tonal" size="small">{{ item.title }}</VChip>
                    </VListItem>
                  </template>
                  <template v-if="hasColorOptions(f)" #chip="{ item, props: chipProps }">
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
                <template v-if="row[0].avatarEntityType" #item="{ item, props: itemProps }">
                  <VListItem v-if="item.value" v-bind="itemProps" :title="item.title">
                    <template #prepend>
                      <AppAvatar :name="item.title" :entity-type="row[0].avatarEntityType" :size="28" />
                    </template>
                  </VListItem>
                </template>
                <template v-if="row[0].avatarEntityType" #chip="{ item, props: chipProps }">
                  <VChip v-if="item.value" v-bind="chipProps" :text="item.title" closable>
                    <template #prepend>
                      <AppAvatar :name="item.title" :entity-type="row[0].avatarEntityType" :size="18" class="mr-1" />
                    </template>
                  </VChip>
                </template>
                <template v-if="hasColorOptions(row[0])" #item="{ item, props: itemProps }">
                  <VListItem v-bind="itemProps" :title="undefined">
                    <VChip :color="chipColor(item.raw.color)" variant="tonal" size="small">{{ item.title }}</VChip>
                  </VListItem>
                </template>
                <template v-if="hasColorOptions(row[0])" #chip="{ item, props: chipProps }">
                  <VChip v-bind="chipProps" :color="chipColor(item.raw.color)" variant="tonal" size="small">
                    {{ item.title }}
                  </VChip>
                </template>
              </component>
            </div>
          </template>
        </VForm>
      </VCardText>
      <VCardActions class="mx-2 mb-2">
        <VSpacer />
        <AppButton variant="text" @click="onCancelClick">
          {{ t("app.common.cancel") }}
        </AppButton>
        <AppButton color="primary" :loading="submitting" @click="onSubmit">
          {{ formSubmitLabel }}
        </AppButton>
      </VCardActions>
    </VCard>

    <VDialog
      v-model="showDiscardConfirm"
      max-width="360"
      content-class="pwa-form-dialog__content"
      class="pwa-discard-dialog"
      :transition="originDialogTransition"
      persistent
    >
      <VCard class="pwa-confirm-dialog__card">
        <VCardText>{{ t("app.common.discardChanges") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <AppButton variant="text" @click="showDiscardConfirm = false">
            {{ t("app.common.cancel") }}
          </AppButton>
          <AppButton color="error" variant="text" @click="confirmDiscard">
            {{ t("app.common.discard") }}
          </AppButton>
        </VCardActions>
      </VCard>
    </VDialog>
  </VDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VTextField, VSelect, VAutocomplete, VCombobox, VTextarea } from "vuetify/components";
import { originDialogTransition } from "@ui";
import { useFormRenderer } from "../composables/useFormRenderer";
import { scrollToFormTop } from "../utils/scrollToFormTop";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";
import AppAvatar, { type AppAvatarEntityType } from "./AppAvatar.vue";
import PhoneField from "./PhoneField.vue";
import type { FormFieldDef, FormFieldType } from "../types/formField";

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
    modelValue: boolean;
    fields: FormFieldDef[];
    initialData?: Record<string, unknown>;
    titleKey: string;
    editTitleKey?: string;
    submitLabelKey?: string;
    editSubmitLabelKey?: string;
    /** Entity-specific derived-fields hook — see useFormRenderer.ts's 3rd param. */
    derive?: (form: Record<string, unknown>) => Partial<Record<string, unknown>> | void;
    /** i18n key for an info banner shown above the form (e.g. "verify this data"). */
    verifyInfoKey?: string;
    /** Shows an AppAvatar next to the dialog title, live-previewing first/last name — opt-in, only for identity-based forms (hcp/lead/patient/user). */
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
  resetForm, hasChanged,
} = useFormRenderer(props.fields, initialDataRef, props.derive);

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

const rows = computed(() => {
  const result: FormFieldDef[][] = [];
  const fields = props.fields.filter((f) => !isFieldHidden(f));
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
});

/**
 * flex-grow ratio, not a literal percentage — flex-basis 0% makes flexbox
 * split the row's free space by the cols ratio directly (6/6 → 50/50,
 * 2/10 → ~17/83), independent of the row's actual pixel width or gap.
 */
function rowItemStyle(f: FormFieldDef): Record<string, string> {
  const cols = f.cols ?? 6;
  return { flex: `${cols} 1 0%`, minWidth: cols <= 2 ? "72px" : "0" };
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
      // no-op: unsupported input type, focus() above is enough
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

function componentFor(type: FormFieldType) {
  switch (type) {
    case "select": return VSelect;
    case "autocomplete": return VAutocomplete;
    case "chips": return VCombobox;
    case "combobox": return VCombobox;
    case "textarea": return VTextarea;
    case "phone": return PhoneField;
    default: return VTextField;
  }
}

function fieldAttrs(f: FormFieldDef): Record<string, unknown> {
  const common: Record<string, unknown> = {
    modelValue: form.value[f.key],
    "onUpdate:modelValue": (v: unknown) => { form.value[f.key] = v; },
    label: labelFor(f),
    variant: "outlined",
    density: "comfortable",
    rules: rulesFor(f),
    hint: f.hint ? t(f.hint) : undefined,
    persistentHint: !!f.hint,
    placeholder: f.placeholder ? t(f.placeholder) : undefined,
    disabled: !!f.immutableOnEdit && isEditMode.value,
    color: colorFor(f),
  };

  switch (f.type) {
    case "email":
      return { ...common, type: "email", autocomplete: "email" };
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
        menuIcon: "",
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
    case "combobox":
      return { ...common, items: resolvedOptions(f), itemTitle: "title", itemValue: "value", clearable: true };
    case "chips":
      return { ...common, items: [], multiple: true, chips: true, closableChips: true };
    case "date":
      return { ...common, type: "date" };
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

watch(
  () => [props.modelValue, props.initialData] as const,
  ([open]) => {
    if (open) {
      resetForm();
      loadAllAsyncOptions();
    }
  },
);

// Options for an already-open dialog (v-if-gated mount, matching every
// other form component's usage) must load once on creation too.
if (props.modelValue) loadAllAsyncOptions();
</script>

<!-- .pwa-form-dialog__*/.pwa-form-row* are shared, global classes — see assets/theme.scss -->
