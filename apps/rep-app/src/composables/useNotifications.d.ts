export type NotificationType = "success" | "info" | "warning" | "error";
export interface Notification {
    id: number;
    message: string;
    type: NotificationType;
    /** Optional i18n key; if set, message is used as fallback or default text */
    key?: string;
}
/**
 * Global notification hub. Use from any component to show toast-style messages.
 * The app must render AppNotificationHub once (e.g. in App.vue or AppLayout).
 */
export declare function useNotifications(): {
    notifications: import("vue").Ref<{
        id: number;
        message: string;
        type: NotificationType;
        key?: string | undefined;
    }[], Notification[] | {
        id: number;
        message: string;
        type: NotificationType;
        key?: string | undefined;
    }[]>;
    current: import("vue").ComputedRef<{
        id: number;
        message: string;
        type: NotificationType;
        key?: string | undefined;
    }>;
    show: (message: string, type?: NotificationType, key?: string) => void;
    dismiss: (id: number) => void;
    dismissCurrent: () => void;
};
