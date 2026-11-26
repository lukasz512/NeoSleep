import { ref, computed } from "vue";
import type AppIcon from "../components/AppIcon.vue";

export type NotificationType = "success" | "info" | "warning" | "error";

export type NotificationIcon = InstanceType<typeof AppIcon>["$props"]["name"];

/** One button on the toast. Clicking it dismisses the toast, then runs `run`. */
export interface NotificationAction {
  /** i18n key of the button label, e.g. "notification.action.retry". */
  labelKey: string;
  run: () => void | Promise<void>;
}

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
  /**
   * What the toast is about (note, patient, clinic…), drawn on the grey tile.
   * The status (success/error…) is the small badge on that tile, so without an
   * icon AppNotifications falls back to a generic one per type.
   */
  icon?: NotificationIcon;
  /** Second line naming the record, e.g. "Anna Nowak". Display name only — never clinical data. */
  context?: string;
  action?: NotificationAction;
  /** Date.now() when shown — the countdown's start. */
  shownAt: number;
}

export interface ShowOptions {
  countdownMs?: number;
  icon?: NotificationIcon;
  context?: string;
  action?: NotificationAction;
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
      {
        id: nextId++,
        message,
        type,
        key,
        countdownMs: options.countdownMs,
        icon: options.icon,
        context: options.context,
        action: options.action,
        shownAt: Date.now(),
      },
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

/** Standard "Retry" action — re-runs the operation that just failed. */
export function retryAction(run: () => void | Promise<void>): NotificationAction {
  return { labelKey: "notification.action.retry", run };
}
