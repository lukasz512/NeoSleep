/**
 * Fires once per app session, right after the authenticated app shell mounts
 * (AppLayout.vue) — whether the user just logged in or a page reload
 * restored an existing session. Same module-level-singleton pattern as
 * useNotifications.ts / useNotificationCenter.ts.
 *
 * Intended for one-time, non-blocking post-login side effects (e.g. warming
 * a partner integration's cache) — not for anything the view needs to await.
 * Callbacks registered after markAppReady() already fired run immediately,
 * so registration order relative to the AppLayout mount doesn't matter.
 */
const readyCallbacks: Array<() => void> = [];
let hasFired = false;

export function onAppReady(callback: () => void): void {
  if (hasFired) {
    callback();
    return;
  }
  readyCallbacks.push(callback);
}

export function markAppReady(): void {
  if (hasFired) return;
  hasFired = true;
  const callbacks = readyCallbacks.splice(0, readyCallbacks.length);
  callbacks.forEach((cb) => cb());
}
