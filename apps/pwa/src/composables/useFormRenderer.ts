import { ref, computed, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import type { FormFieldDef, FormFieldOption } from "../types/formField";

/**
 * Generic form-state engine behind FormRenderer.vue.
 *
 * Mirrors the state/validation/payload/dirty-check shape every hand-authored
 * use<Entity>Form.ts composable already implements (see useOrganizationForm.ts,
 * usePatientForm.ts) but driven entirely by a FormFieldDef[] array instead of
 * a hand-written interface + template. No entity-specific logic belongs here —
 * that lives only in apps/pwa/src/config/forms/<entity>Form.ts.
 *
 * Dialog-open/close UX (the confirm-discard interaction) is owned by
 * FormRenderer.vue itself, exactly like every other form component — this
 * composable only exposes the primitives (`resetForm`, `hasChanged`) it needs.
 */
export function useFormRenderer(
  fields: FormFieldDef[],
  initialData: Ref<Record<string, unknown> | undefined>,
) {
  const { t } = useI18n();

  const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
  const form = ref<Record<string, unknown>>({});
  const snapshot = ref<Record<string, unknown>>({});
  const optionsCache = ref<Record<string, FormFieldOption[]>>({});
  const loadingOptions = ref<Record<string, boolean>>({});

  const isEditMode = computed(() => !!initialData.value?.id);

  function defaultValueFor(field: FormFieldDef): unknown {
    if (field.default !== undefined) return field.default;
    return field.type === "chips" ? [] : "";
  }

  function buildFormState(source?: Record<string, unknown>): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = source ? source[f.key] : undefined;
      if (raw === undefined || raw === null) {
        next[f.key] = defaultValueFor(f);
      } else if (f.type === "chips") {
        next[f.key] = Array.isArray(raw) ? [...raw] : [];
      } else if (f.type === "number") {
        next[f.key] = raw === "" ? "" : String(raw);
      } else if (f.type === "phone") {
        next[f.key] = String(raw).replace(/\D/g, "");
      } else if (typeof raw === "string") {
        next[f.key] = raw.trim();
      } else {
        next[f.key] = raw;
      }
    }
    return next;
  }

  /** Snapshot on open — call when the host dialog transitions to open. */
  function resetForm() {
    form.value = buildFormState(initialData.value);
    snapshot.value = { ...form.value };
  }

  /** Dirty-check on close attempt — call before letting the dialog close. */
  function hasChanged(): boolean {
    for (const f of fields) {
      const a = form.value[f.key];
      const b = snapshot.value[f.key];
      if (Array.isArray(a) || Array.isArray(b)) {
        const aArr = Array.isArray(a) ? a : [];
        const bArr = Array.isArray(b) ? b : [];
        if (JSON.stringify(aArr) !== JSON.stringify(bArr)) return true;
      } else if (typeof a === "string" || typeof b === "string") {
        if ((a ?? "").toString().trim() !== (b ?? "").toString().trim()) return true;
      } else if (a !== b) {
        return true;
      }
    }
    return false;
  }

  function resolvedOptions(field: FormFieldDef): FormFieldOption[] {
    if (Array.isArray(field.options)) {
      // Static options: `title` is an i18n key (see formField.ts's doc
      // comment on FormFieldOption) — resolve it here so it stays reactive
      // to locale switches without the config file needing a translator.
      return field.options.map((o) => ({ ...o, title: t(o.title) }));
    }
    // Async-loaded options (API-fetched names, etc.) are already final
    // display strings — never routed through t().
    return optionsCache.value[field.key] ?? [];
  }

  async function loadOptionsFor(field: FormFieldDef) {
    if (typeof field.options !== "function") return;
    if (optionsCache.value[field.key]) return; // cached — loaded once
    loadingOptions.value = { ...loadingOptions.value, [field.key]: true };
    try {
      const loader = field.options;
      const opts = await loader();
      optionsCache.value = { ...optionsCache.value, [field.key]: opts };
    } finally {
      loadingOptions.value = { ...loadingOptions.value, [field.key]: false };
    }
  }

  /** Loads every async ('autocomplete') field's options — call on dialog open. */
  async function loadAllAsyncOptions() {
    await Promise.all(
      fields
        .filter((f) => typeof f.options === "function")
        .map((f) => loadOptionsFor(f)),
    );
  }

  function rulesFor(field: FormFieldDef): ((v: unknown) => true | string)[] {
    const rules: ((v: unknown) => true | string)[] = [];
    if (field.required) {
      rules.push((v: unknown) => {
        const empty = v === undefined || v === null
          || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");
        return !empty || t("app.formRenderer.validation.required");
      });
    }
    for (const rule of field.rules ?? []) {
      rules.push((v: unknown) => {
        const result = rule(v);
        return result === true ? true : t(result);
      });
    }
    return rules;
  }

  async function validate(): Promise<boolean> {
    const result = await formRef.value?.validate();
    return !!result?.valid;
  }

  /** Builds the plain-object payload from current form state (trims/filters, drops blanks to undefined). */
  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = form.value[f.key];
      if (f.type === "chips") {
        payload[f.key] = Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : [];
      } else if (f.type === "number") {
        const s = String(v ?? "").trim();
        payload[f.key] = s === "" ? undefined : Number(s);
      } else if (typeof v === "string") {
        const trimmed = v.trim();
        payload[f.key] = trimmed === "" ? undefined : trimmed;
      } else {
        payload[f.key] = v;
      }
    }
    if (initialData.value?.id) payload.id = initialData.value.id;
    return payload;
  }

  // Seed initial state synchronously (mirrors every hand-authored
  // use<Entity>Form.ts composable initializing `form` at creation time) —
  // the host's own watch(modelValue) re-calls resetForm() for later opens.
  resetForm();

  return {
    formRef,
    form,
    isEditMode,
    resolvedOptions,
    loadingOptions,
    loadAllAsyncOptions,
    rulesFor,
    validate,
    buildPayload,
    resetForm,
    hasChanged,
  };
}
