import { ref, computed, watch, type Ref } from "vue";
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
  derive?: (form: Record<string, unknown>) => Partial<Record<string, unknown>> | void,
) {
  const { t } = useI18n();

  const formRef = ref<{ validate: () => Promise<{ valid: boolean }>; $el?: Element } | null>(null);
  const form = ref<Record<string, unknown>>({});
  const snapshot = ref<Record<string, unknown>>({});
  const optionsCache = ref<Record<string, FormFieldOption[]>>({});
  const loadingOptions = ref<Record<string, boolean>>({});

  const isEditMode = computed(() => !!initialData.value?.id);

  function defaultValueFor(field: FormFieldDef): unknown {
    if (typeof field.default === "function") return (field.default as () => unknown)();
    if (field.default !== undefined) return field.default;
    return field.type === "chips" || field.multiple ? [] : "";
  }

  function buildFormState(source?: Record<string, unknown>): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    for (const f of fields) {
      const container = f.nestUnder
        ? (source?.[f.nestUnder] as Record<string, unknown> | undefined)
        : source;
      const raw = container ? container[f.key] : undefined;
      if (raw === undefined || raw === null) {
        next[f.key] = defaultValueFor(f);
      } else if (f.type === "chips" || f.multiple) {
        next[f.key] = Array.isArray(raw) ? [...raw] : [];
      } else if (f.type === "number") {
        next[f.key] = raw === "" ? "" : String(raw);
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

  async function loadOptionsFor(field: FormFieldDef, force = false) {
    if (typeof field.options !== "function") return;
    if (!force && optionsCache.value[field.key]) return; // cached — loaded once
    loadingOptions.value = { ...loadingOptions.value, [field.key]: true };
    try {
      const loader = field.options;
      const opts = await loader(form.value);
      optionsCache.value = { ...optionsCache.value, [field.key]: opts };
      if (field.autoSelectFirstIfEmpty && !form.value[field.key] && opts[0]) {
        form.value = { ...form.value, [field.key]: opts[0].value };
      }
    } finally {
      loadingOptions.value = { ...loadingOptions.value, [field.key]: false };
    }
  }

  // Fields with `dependsOn` reload (and force-refresh, bypassing the cache)
  // whenever any of the depended-on fields' values change. Registered once —
  // this composable instance lives for the dialog's whole lifetime.
  //
  // Each depended-on key is passed as its OWN getter (Vue's multi-source
  // watch form) rather than one getter returning `keys.map(...)` — a single
  // getter would return a brand-new array every run, which is always
  // "changed" by reference, so the callback would spuriously refire on
  // every unrelated `form.value` reassignment (e.g. another field's
  // autoSelectFirstIfEmpty or the `derive` hook below). The multi-source
  // form compares each key's own value individually.
  for (const f of fields) {
    if (f.dependsOn?.length) {
      const sources = f.dependsOn.map((k) => () => form.value[k]);
      watch(sources, () => { loadOptionsFor(f, true); });
    }
  }

  // Optional entity-specific derived-fields hook (e.g. a hidden field synced
  // live from another field's value, like HCP.region from the selected clinic).
  if (derive) {
    watch(
      form,
      (val) => {
        const patch = derive(val);
        if (!patch) return;
        let changed = false;
        const next = { ...val };
        for (const k in patch) {
          if (next[k] !== patch[k]) { next[k] = patch[k]; changed = true; }
        }
        if (changed) form.value = next;
      },
      { deep: true },
    );
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
      let out: unknown;
      if (f.type === "chips") {
        out = Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : [];
      } else if (f.type === "number") {
        const s = String(v ?? "").trim();
        out = s === "" ? undefined : Number(s);
      } else if (typeof v === "string") {
        const trimmed = v.trim();
        out = trimmed === "" ? undefined : trimmed;
      } else {
        out = v;
      }

      if (f.nestUnder) {
        const bucket = (payload[f.nestUnder] ??= {}) as Record<string, unknown>;
        if (out !== undefined) bucket[f.key] = out;
      } else {
        payload[f.key] = out;
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
