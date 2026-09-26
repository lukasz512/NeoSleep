import { ref, type Ref } from "vue";
import { errorBodyKeyOr } from "@api";
import { fieldErrorsFromResponse, type FieldErrors } from "./useFormErrorSummary";

/**
 * Where an auth flow's failure is shown (NEO-109): in the form (a field the API
 * rejected, or a form-level line in the summary box such as "wrong email or
 * password") or, only for what no field or form can fix (no connection,
 * timeout, server error, rate limit), as a toast.
 */
export interface FlowErrors {
  /** Form-level error — a key-less line in the form's summary box. */
  errorKey: Ref<string | null>;
  /** Not the form's fault — the view shows it as a toast. */
  toastKey: Ref<string | null>;
  /** Fields the API rejected (400 VALIDATION_ERROR with `field`). */
  fieldErrors: Ref<FieldErrors | null>;
}

export function createFlowErrors(): FlowErrors {
  return { errorKey: ref(null), toastKey: ref(null), fieldErrors: ref(null) };
}

export function clearFlowErrors(errors: FlowErrors) {
  errors.errorKey.value = null;
  errors.toastKey.value = null;
  errors.fieldErrors.value = null;
}

/** For a thrown error (the request never completed): always a toast. */
export function applyCaughtError(errors: FlowErrors, err: unknown, fallbackKey: string) {
  errors.toastKey.value = errorBodyKeyOr(err, fallbackKey);
}

/**
 * For a non-2xx response: the rejected field when the API names one, a toast
 * when it's on our side / the connection, otherwise the form's own message.
 */
export async function applyFailedResponse(
  errors: FlowErrors,
  res: Response,
  failure: unknown,
  formKey: string,
): Promise<void> {
  const key = errorBodyKeyOr(failure, formKey);
  if (key !== formKey) {
    errors.toastKey.value = key;
    return;
  }
  const fields = await fieldErrorsFromResponse(res);
  if (fields) errors.fieldErrors.value = fields;
  else errors.errorKey.value = formKey;
}
