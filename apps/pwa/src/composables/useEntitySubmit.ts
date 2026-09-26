import { getCurrentInstance } from "vue";
import { useRouter } from "vue-router";
import { reportCaught } from "@api";
import { useNotifications, type NotificationIcon, type ShowOptions } from "./useNotifications";
import { fieldErrorsFromResponse, type FieldErrors } from "./useFormErrors";

export interface EntitySubmitResult {
  ok: boolean;
  /** HTTP status and a body reader — a fetch Response has both; read only on a 400 (NEO-109). */
  status?: number;
  clone?: () => { json: () => Promise<unknown> };
}

/** The form's resolver: true closes the dialog; false keeps it open, marking `fieldErrors` when the API named a field. */
export type SubmitDone = (ok: boolean, fieldErrors?: FieldErrors) => void;

export interface EntitySubmitOptions {
  request: () => Promise<EntitySubmitResult>;
  successMessage: string;
  errorMessage: string;
  onSuccess?: (result: EntitySubmitResult) => void | Promise<void>;
  refresh?: boolean;
  /** What the form saves (patient, clinic, visit…) — the toast's tile icon. */
  icon: NotificationIcon;
  /** Display name of the record the form belongs to, when there is one. */
  context?: string;
  /**
   * Create forms opened from an entity's own list (NEO-119): the detail route
   * to open for the record just created, e.g. "patient-detail". The id comes
   * from the API's 201 body. Omit it everywhere else — an edit, or a create
   * made from inside another flow (booking, a doctor card) keeps the user
   * where they are.
   */
  openCreated?: string;
}

/** The new record's id from a create response body, or null when there is none. */
async function createdId(result: EntitySubmitResult): Promise<string | null> {
  try {
    const body = await result.clone?.().json();
    const id = body && typeof body === "object" ? (body as { id?: unknown }).id : undefined;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

/**
 * Single place every entity form's save handler goes through, so success/error
 * notifications and the "did it work" resolver stay consistent app-wide. `done`
 * is always called the instant success/failure is known — never after an
 * `onSuccess` refetch — because FormRenderer only starts closing the dialog once
 * `done` resolves; calling it late leaves the dialog open while a refetch (e.g.
 * a detail view reloading) can null out its bound data and flash the form blank.
 */
export function useEntitySubmit() {
  const notifications = useNotifications();
  // Only inside a component (the router is injected); plain-function callers
  // and unit tests have none, and never pass `openCreated`.
  const router = getCurrentInstance() ? useRouter() : undefined;

  /**
   * `opts.request()` is called unconditionally today — this is the one seam
   * where a future offline mode would branch: if offline, queue the payload
   * locally, resolve as if `request()` succeeded, and flush the queue on
   * reconnect instead of calling `request()` here. The rest of this function
   * already behaves like the request is "committed" the moment it's called
   * (`done` resolves before any side effect, and every form's Cancel button
   * is already disabled while a request is in flight, via AppButton's global
   * loader) — so no other change would be needed to add that branch later.
   */
  async function submit(opts: EntitySubmitOptions, done: SubmitDone) {
    // No Retry on a failed save: the form stays open with its own Save
    // button, which is the retry — a second one in the toast would race it.
    const toast: ShowOptions = { icon: opts.icon, context: opts.context };
    let result: EntitySubmitResult;
    try {
      result = await opts.request();
    } catch (err) {
      reportCaught(err, { where: "useEntitySubmit.submit" });
      notifications.show(opts.errorMessage, "error", undefined, toast);
      done(false);
      return;
    }
    if (!result.ok) {
      // A rejected field is marked in the form itself, not toasted (NEO-109).
      const fieldErrors = await fieldErrorsFromResponse(result);
      if (fieldErrors) {
        done(false, fieldErrors);
        return;
      }
      notifications.show(opts.errorMessage, "error", undefined, toast);
      done(false);
      return;
    }
    notifications.show(opts.successMessage, "success", undefined, toast);
    done(true);
    if (opts.refresh !== false) window.dispatchEvent(new Event("entity-list-refresh"));
    if (opts.onSuccess) await opts.onSuccess(result);
    // Like Salesforce/Veeva and an EHR's registration → chart: the next step
    // (booking, a questionnaire, a study) happens on the new record's page.
    if (opts.openCreated && router) {
      const id = await createdId(result);
      if (id) await router.push({ name: opts.openCreated, params: { id } });
    }
  }

  return { submit };
}
