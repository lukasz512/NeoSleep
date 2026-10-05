import { watch, type WatchSource } from "vue";
import type { Router } from "vue-router";
import type { NotificationType } from "../composables/useNotifications";

/**
 * Sends the app to /login the moment the signed-in user disappears mid-use
 * (refresh token rejected, or signed out in another tab).
 *
 * The router guard only runs on navigation, so before this the current screen
 * stayed up with no user: the header fell back to the placeholder name and every
 * request failed, which looked like the app froze and switched to another person.
 */
export interface SessionLossDeps {
  /** The signed-in user's id, or null when nobody is signed in. */
  userId: WatchSource<string | null>;
  notify: (message: string, type: NotificationType, key?: string) => void;
  message: () => string;
}

export interface CrossTabSessionDeps {
  userId: WatchSource<string | null>;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /** Registers a listener for `storage` events, which fire only for writes made by OTHER tabs. */
  onStorage: (listener: (event: Pick<StorageEvent, "key" | "newValue">) => void) => void;
  /** Another tab signed out: sign this one out too. */
  signOut: () => void;
  /** Another tab signed in as someone else: reload so this tab never shows one person's
   *  header over another person's data (all tabs share one refresh token). */
  reload: () => void;
}

/** Keeps every tab of this browser on the same signed-in person (or none). */
export function installCrossTabSessionSync(storageKey: string, deps: CrossTabSessionDeps): void {
  let current: string | null = null;
  watch(
    deps.userId,
    (id, previous) => {
      current = id;
      try {
        if (id) deps.storage?.setItem(storageKey, id);
        // Only a real sign-out clears it: at boot nobody is signed in YET, and clearing
        // then would sign every other open tab out.
        else if (previous) deps.storage?.removeItem(storageKey);
      } catch {
        // benign: storage blocked (private mode) — tabs just aren't kept in step.
      }
    },
    { immediate: true },
  );
  deps.onStorage((event) => {
    if (event.key !== storageKey || !current || event.newValue === current) return;
    if (event.newValue === null) deps.signOut();
    else deps.reload();
  });
}

export function installSessionLossRedirect(router: Router, deps: SessionLossDeps): void {
  watch(deps.userId, (current, previous) => {
    if (!previous || current) return;
    const route = router.currentRoute.value;
    if (!route.meta.requiresAuth) return;
    deps.notify(deps.message(), "warning", "session-ended");
    void router.replace({ path: "/login", query: { redirect: route.fullPath } });
  });
}
