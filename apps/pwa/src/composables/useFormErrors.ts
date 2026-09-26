import { computed, ref, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import { isFieldErrorStatus } from "@api";

/**
 * How every form in the app shows its errors (NEO-109, variant B): under the
 * field, in a summary box on top (@ui FormErrorSummary — each line jumps to
 * its field) and, in sectioned forms, as a count on the section heading.
 * Never as a toast — a toast is only for what no field can fix (no
 * connection, server error). FormRenderer uses this, and so does every
 * hand-written form (EventForm, AppointmentDialog, the OrthoApnea wizard, …).
 */

/**
 * Why the API rejected a field — picks the fallback message when there's no
 * field-specific one. "taken": the value (an email) already belongs to
 * someone else (409 EMAIL_IN_USE, NEO-111).
 */
export type ServerFieldReason = "required" | "invalid" | "taken";

/** Field key → why the API rejected it. */
export type FieldErrors = Record<string, ServerFieldReason>;

/**
 * The field a 400 VALIDATION_ERROR or 409 EMAIL_IN_USE names (`{ error, code,
 * field, reason }`, see apps/api/src/errors.ts), or null for any other
 * failure. Reads a clone, so the caller can still read the body itself.
 */
export async function fieldErrorsFromResponse(res: { status?: number; clone?: () => { json: () => Promise<unknown> } }): Promise<FieldErrors | null> {
  if (!isFieldErrorStatus(res.status) || !res.clone) return null;
  try {
    const body = (await res.clone().json()) as { field?: unknown; reason?: unknown };
    if (typeof body.field !== "string" || !body.field) return null;
    const reason: ServerFieldReason = body.reason === "required" || body.reason === "taken" ? body.reason : "invalid";
    return { [body.field]: reason };
  } catch {
    // benign: a non-JSON 400 names no field — the caller's own toast covers it.
    return null;
  }
}

/** One line of the summary box — same shape as @ui FormErrorSummary's lines; no `key` = about the whole form. */
export interface FormErrorSummaryLine {
  key?: string;
  label?: string;
  message: string;
}

/** One field as a hand-written form describes it to the summary. */
export interface FormErrorField {
  key: string;
  label: string;
  value: unknown;
  rules?: ((v: unknown) => true | string)[];
}

/** Scrolls a field into view and puts the cursor in it — the summary's links. */
export function focusFormField(el: Element | null | undefined) {
  if (!(el instanceof HTMLElement)) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  // The typing target first — a stepper's −/+ buttons come before its input in the DOM.
  (el.querySelector<HTMLElement>("input:not([type=hidden]), textarea") ?? el.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
}

export function useFormErrors() {
  const { t, te } = useI18n();

  /** Errors show only after the first Save, so an empty form doesn't open all red. */
  const attempted = ref(false);
  const serverErrors = ref<FieldErrors>({});

  /** The API's verdict on a field, translated: the field's own message, else "required" / "check this field". */
  function serverError(key: string): string | undefined {
    const reason = serverErrors.value[key];
    if (!reason) return undefined;
    // "Already used by someone else" beats the field's own format message.
    if (reason === "taken") return t("app.formRenderer.validation.taken");
    const specific = `app.formRenderer.validation.server.${key}`;
    if (te(specific)) return t(specific);
    return t(reason === "required" ? "app.formRenderer.validation.required" : "app.formRenderer.validation.invalid");
  }

  /** Call on every edit of a field — a rejected value's error goes the moment it changes. */
  function clearServerError(key: string) {
    if (!serverErrors.value[key]) return;
    const rest = { ...serverErrors.value };
    delete rest[key];
    serverErrors.value = rest;
  }

  /**
   * Marks the fields the API rejected, keeping only those this form shows.
   * Returns false when none of them is on the form — the caller then falls
   * back to its toast, since there's nothing to mark.
   */
  function setServerErrors(errors: FieldErrors, shownKeys: Iterable<string>): boolean {
    const shown = new Set(shownKeys);
    const known = Object.fromEntries(Object.entries(errors).filter(([key]) => shown.has(key))) as FieldErrors;
    attempted.value = true;
    serverErrors.value = known;
    return Object.keys(known).length > 0;
  }

  function reset() {
    attempted.value = false;
    serverErrors.value = {};
  }

  /** The first thing wrong with a field right now — the API's verdict first, then its own rules. */
  function firstError(field: FormErrorField): string | undefined {
    const server = serverError(field.key);
    if (server) return server;
    for (const rule of field.rules ?? []) {
      const result = rule(field.value);
      if (result !== true) return result;
    }
    return undefined;
  }

  /** The summary's lines, in form order — empty until the first Save. */
  function errorListFor(fields: Ref<FormErrorField[]> | (() => FormErrorField[])) {
    const read = typeof fields === "function" ? fields : () => fields.value;
    return computed<FormErrorSummaryLine[]>(() => {
      if (!attempted.value) return [];
      return read().flatMap((f) => {
        const message = firstError(f);
        return message ? [{ key: f.key, label: f.label, message }] : [];
      });
    });
  }

  return { attempted, serverErrors, serverError, clearServerError, setServerErrors, reset, firstError, errorListFor };
}
