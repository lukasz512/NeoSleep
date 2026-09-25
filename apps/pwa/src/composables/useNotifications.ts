import { ref, computed } from "vue";

export type NotificationType = "success" | "info" | "warning" | "error";

export interface Notification {
  id: number;
  message: string;
  type: NotificationType;
  /** Optional i18n key; if set, message is used as fallback or default text */
  key?: string;
  /**
   * Countdown toast: `key` is rendered with a live `{seconds}` param counting
   * down over `countdownMs`, the progress bar spans the same time, and the
   * toast does not auto-dismiss — whatever it announces (e.g. a reload)
   * happens at zero.
   */
  countdownMs?: number;
  /** Date.now() when shown — the countdown's start. */
  shownAt: number;
}

export interface ShowOptions {
  countdownMs?: number;
}

const notifications = ref<Notification[]>([]);
let nextId = 1;

/**
 * Global toast/snackbar hub. Use from any component to show transient status
 * messages. The app must render AppNotifications.vue once (see App.vue, which
 * mounts it above the layout switch so it covers both AppLayout and
 * PublicLayout routes).
 * Not to be confused with useNotificationCenter.ts, the unrelated backend-backed
 * bell/inbox (ADR-012).
 */
export function useNotifications() {
  const current = computed(() => notifications.value[0] ?? null);

  function show(message: string, type: NotificationType = "info", key?: string, options: ShowOptions = {}): void {
    notifications.value = [
      ...notifications.value,
      { id: nextId++, message, type, key, countdownMs: options.countdownMs, shownAt: Date.now() },
    ];
  }

  function dismiss(id: number): void {
    notifications.value = notifications.value.filter((n) => n.id !== id);
  }

  function dismissCurrent(): void {
    if (notifications.value.length > 0) {
      notifications.value = notifications.value.slice(1);
    }
  }

  return {
    notifications,
    current,
    show,
    dismiss,
    dismissCurrent,
  };
}
