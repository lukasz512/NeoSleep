import { computed, ref, type ComputedRef, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import type { FormErrorSummaryLine } from "../components/FormErrorSummary.vue";

/**
 * The @ui side of "errors live in the form" (NEO-109): the same small logic as
 * the PWA's useFormErrors (apps/pwa/src/composables/useFormErrors.ts), which
 * packages/ui can't import. Used by the sign-in / forgot / reset / change
 * password forms: each field's message under it (Vuetify rules + the API's
 * verdict) and a FormErrorSummary on top listing every field error plus any
 * form-level one ("wrong email or password") — never a toast for those.
 */

/** Why the API rejected a field (`reason` of a 400 VALIDATION_ERROR). */
export type ServerFieldReason = "required" | "invalid";

/** Field key → why the API rejected it. */
export type FieldErrors = Record<string, ServerFieldReason>;

/**
 * The field a 400 VALIDATION_ERROR names (`{ error, code, field, reason }`,
 * see apps/api/src/errors.ts), or null for any other failure. Reads a clone,
 * so the caller can still read the body itself.
 */
export async function fieldErrorsFromResponse(res: Response): Promise<FieldErrors | null> {
  if (res.status !== 400) return null;
  try {
    const body = (await res.clone().json()) as { field?: unknown; reason?: unknown };
    if (typeof body.field !== "string" || !body.field) return null;
    return { [body.field]: body.reason === "required" ? "required" : "invalid" };
  } catch {
    // benign: a non-JSON 400 names no field — the caller's form-level message covers it.
    return null;
  }
}

/** One field as a form describes it to the summary. */
export interface SummaryField {
  key: string;
  label: string;
  value: string;
  rules: ((v: string) => true | string)[];
}

/** Scrolls a field into view and puts the cursor in it — the summary's links. */
export function focusFormField(el: Element | null | undefined) {
  if (!(el instanceof HTMLElement)) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView?.({ block: "center", behavior: reduce ? "auto" : "smooth" });
  el.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true });
}

export interface FormErrorSummaryState {
  /** Field errors show in the summary only after the first submit attempt. */
  attempted: Ref<boolean>;
  /** The API's verdict on a field, translated — bind to the field's `error-messages`. */
  serverError: (key: string) => string | undefined;
  /** Call on every edit of a field — a rejected value's error goes the moment it changes. */
  clearServerError: (key: string) => void;
  /** Marks the fields the API rejected that this form shows; false when none is on it. */
  setServerErrors: (errors: FieldErrors) => boolean;
  /** Marks one field with a specific message (e.g. "Current password is incorrect"). */
  setServerMessage: (key: string, message: string) => void;
  /** The summary's lines: field errors in form order (after the first submit), then form-level ones. */
  lines: ComputedRef<FormErrorSummaryLine[]>;
  /** The summary's title: "Fields to fix: n" when a field is listed, else the form's own title. */
  title: ComputedRef<string>;
}

export function useFormErrorSummary(opts: {
  fields: () => SummaryField[];
  /** i18n keys of form-level errors (no field to point at), already set by the flow. */
  formErrorKeys: () => (string | null | undefined)[];
  /** Title when only form-level errors are listed, e.g. "Couldn't sign in". */
  formTitleKey: string;
}): FormErrorSummaryState {
  const { t } = useI18n();
  const attempted = ref(false);
  const serverErrors = ref<FieldErrors>({});
  const serverMessages = ref<Record<string, string>>({});

  function serverError(key: string): string | undefined {
    const custom = serverMessages.value[key];
    if (custom) return custom;
    const reason = serverErrors.value[key];
    if (!reason) return undefined;
    return t(reason === "required" ? "app.formRenderer.validation.required" : "app.formRenderer.validation.invalid");
  }

  function clearServerError(key: string) {
    if (serverMessages.value[key]) {
      const rest = { ...serverMessages.value };
      delete rest[key];
      serverMessages.value = rest;
    }
    if (serverErrors.value[key]) {
      const rest = { ...serverErrors.value };
      delete rest[key];
      serverErrors.value = rest;
    }
  }

  function setServerErrors(errors: FieldErrors): boolean {
    const shown = new Set(opts.fields().map((f) => f.key));
    const known = Object.fromEntries(Object.entries(errors).filter(([key]) => shown.has(key))) as FieldErrors;
    attempted.value = true;
    serverErrors.value = known;
    return Object.keys(known).length > 0;
  }

  function setServerMessage(key: string, message: string) {
    attempted.value = true;
    serverMessages.value = { ...serverMessages.value, [key]: message };
  }

  function firstError(field: SummaryField): string | undefined {
    const server = serverError(field.key);
    if (server) return server;
    for (const rule of field.rules) {
      const result = rule(field.value);
      if (result !== true) return result;
    }
    return undefined;
  }

  const fieldLines = computed<FormErrorSummaryLine[]>(() => {
    if (!attempted.value) return [];
    return opts.fields().flatMap((f) => {
      const message = firstError(f);
      return message ? [{ key: f.key, label: f.label, message }] : [];
    });
  });

  const lines = computed<FormErrorSummaryLine[]>(() => [
    ...fieldLines.value,
    ...opts.formErrorKeys().flatMap((key) => (key ? [{ message: t(key) }] : [])),
  ]);

  const title = computed(() =>
    fieldLines.value.length
      ? t("app.formRenderer.errorSummary.title", { n: fieldLines.value.length })
      : t(opts.formTitleKey),
  );

  return { attempted, serverError, clearServerError, setServerErrors, setServerMessage, lines, title };
}
