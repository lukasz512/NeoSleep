import { useNotifications } from "./useNotifications";

export interface EntitySubmitResult {
  ok: boolean;
}

export interface EntitySubmitOptions {
  request: () => Promise<EntitySubmitResult>;
  successMessage: string;
  errorMessage: string;
  onSuccess?: (result: EntitySubmitResult) => void | Promise<void>;
  refresh?: boolean;
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
  async function submit(opts: EntitySubmitOptions, done: (ok: boolean) => void) {
    let result: EntitySubmitResult;
    try {
      result = await opts.request();
    } catch {
      notifications.show(opts.errorMessage, "error");
      done(false);
      return;
    }
    if (!result.ok) {
      notifications.show(opts.errorMessage, "error");
      done(false);
      return;
    }
    notifications.show(opts.successMessage, "success");
    done(true);
    if (opts.refresh !== false) window.dispatchEvent(new Event("entity-list-refresh"));
    if (opts.onSuccess) await opts.onSuccess(result);
  }

  return { submit };
}
