<template>
  <VDialog
    :model-value="modelValue"
    max-width="680"
    content-class="pwa-form-dialog__content"
    class="form-renderer-dialog"
    @update:model-value="onDialogUpdate"
  >
    <VCard class="pwa-form-dialog__card">
      <VCardTitle class="mx-2 mt-2 text-h6">
        {{ formTitle }}
      </VCardTitle>
      <VCardText>
        <VForm ref="formRef" @submit.prevent="onSubmit">
          <template v-for="(row, ri) in rows" :key="ri">
            <div v-if="row.length > 1" class="pwa-form-row mb-3">
              <div v-for="f in row" :key="f.key" class="pwa-form-row-item">
                <component
                  :is="componentFor(f.type)"
                  v-bind="fieldAttrs(f)"
                />
              </div>
            </div>
            <div v-else class="mb-3">
              <component
                :is="componentFor(row[0].type)"
                v-bind="fieldAttrs(row[0])"
              />
            </div>
          </template>
        </VForm>
      </VCardText>
      <VCardActions class="mx-2 mb-2">
        <VSpacer />
        <VBtn variant="text" @click="onCancelClick">
          {{ t("app.common.cancel") }}
        </VBtn>
        <VBtn color="primary" :loading="submitting" @click="onSubmit">
          {{ formSubmitLabel }}
        </VBtn>
      </VCardActions>
    </VCard>

    <VDialog
      v-model="showDiscardConfirm"
      max-width="360"
      content-class="pwa-form-dialog__content"
      persistent
    >
      <VCard>
        <VCardText>{{ t("app.common.discardChanges") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" @click="showDiscardConfirm = false">
            {{ t("app.common.cancel") }}
          </VBtn>
          <VBtn color="error" variant="text" @click="confirmDiscard">
            {{ t("app.common.discard") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </VDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useFormRenderer } from "../composables/useFormRenderer";
import type { FormFieldDef, FormFieldType } from "../types/formField";

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
  }>(),
  { modelValue: false },
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [payload: Record<string, unknown>];
}>();

const { t } = useI18n();

const initialDataRef = computed(() => props.initialData);
const {
  formRef, form, isEditMode,
  resolvedOptions, loadingOptions, loadAllAsyncOptions,
  rulesFor, validate, buildPayload,
  resetForm, hasChanged,
} = useFormRenderer(props.fields, initialDataRef);

const submitting = ref(false);
const showDiscardConfirm = ref(false);

const formTitle = computed(() =>
  isEditMode.value && props.editTitleKey ? t(props.editTitleKey) : t(props.titleKey),
);
const formSubmitLabel = computed(() => {
  if (isEditMode.value) return t(props.editSubmitLabelKey ?? props.submitLabelKey ?? props.titleKey);
  return t(props.submitLabelKey ?? props.titleKey);
});

const rows = computed(() => {
  const result: FormFieldDef[][] = [];
  const fields = props.fields;
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    const next = fields[i + 1];
    if (f.cols === 6 && next?.cols === 6) {
      result.push([f, next]);
      i += 2;
    } else {
      result.push([f]);
      i += 1;
    }
  }
  return result;
});

function componentFor(type: FormFieldType): string {
  switch (type) {
    case "select": return "VSelect";
    case "autocomplete": return "VAutocomplete";
    case "chips": return "VCombobox";
    case "textarea": return "VTextarea";
    default: return "VTextField";
  }
}

function fieldAttrs(f: FormFieldDef): Record<string, unknown> {
  const common: Record<string, unknown> = {
    modelValue: form.value[f.key],
    "onUpdate:modelValue": (v: unknown) => { form.value[f.key] = v; },
    label: t(f.labelKey),
    variant: "outlined",
    density: "comfortable",
    rules: rulesFor(f),
    hint: f.hint ? t(f.hint) : undefined,
    persistentHint: !!f.hint,
  };

  switch (f.type) {
    case "email":
      return { ...common, type: "email", autocomplete: "email" };
    case "phone":
      return {
        ...common,
        type: "tel",
        autocomplete: "tel",
        "onUpdate:modelValue": (v: unknown) => { form.value[f.key] = String(v ?? "").replace(/\D/g, ""); },
      };
    case "textarea":
      return { ...common, autoGrow: true, rows: 3 };
    case "number":
      return { ...common, type: "number" };
    case "select":
      return { ...common, items: resolvedOptions(f), itemTitle: "title", itemValue: "value" };
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
  if (!valid) return;
  submitting.value = true;
  try {
    const payload = buildPayload();
    emit("submit", payload);
    emit("update:modelValue", false);
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
