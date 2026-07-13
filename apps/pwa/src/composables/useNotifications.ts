import { ref, computed } from "vue";

export type NotificationType = "success" | "info" | "warning" | "error";

export interface Notification {
  id: number;
  message: string;
  type: NotificationType;
  /** Optional i18n key; if set, message is used as fallback or default text */
  key?: string;
}

const notifications = ref<Notification[]>([]);
let nextId = 1;

/**
 * Global notification hub. Use from any component to show toast-style messages.
 * The app must render AppNotificationHub once (e.g. in App.vue or AppLayout).
 */
export function useNotifications() {
  const current = computed(() => notifications.value[0] ?? null);

  function show(message: string, type: NotificationType = "info", key?: string): void {
    notifications.value = [
      ...notifications.value,
      { id: nextId++, message, type, key },
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
