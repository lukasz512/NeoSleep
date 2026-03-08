import { ref, computed } from "vue";
const notifications = ref([]);
let nextId = 1;
/**
 * Global notification hub. Use from any component to show toast-style messages.
 * The app must render AppNotificationHub once (e.g. in App.vue or AppLayout).
 */
export function useNotifications() {
    const current = computed(() => notifications.value[0] ?? null);
    function show(message, type = "info", key) {
        notifications.value = [
            ...notifications.value,
            { id: nextId++, message, type, key },
        ];
    }
    function dismiss(id) {
        notifications.value = notifications.value.filter((n) => n.id !== id);
    }
    function dismissCurrent() {
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
