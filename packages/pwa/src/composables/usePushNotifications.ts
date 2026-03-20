/**
 * usePushNotifications — Web Push API client composable.
 *
 * Handles: permission request, subscribe/unsubscribe, status tracking.
 * Sends subscription to BFF at POST /api/push/subscribe.
 *
 * Usage:
 *   const { isSupported, permission, subscribe, unsubscribe } = usePushNotifications()
 *
 * The VAPID public key is read from VITE_VAPID_PUBLIC_KEY env var.
 * The BFF API URL is read from VITE_API_URL (or same-origin if not set).
 */
import { ref, computed } from "vue";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding  = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64   = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData  = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function getApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function usePushNotifications() {
  const isSupported = computed(() =>
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );

  const permission  = ref<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  const isSubscribed = ref(false);

  async function requestPermission(): Promise<NotificationPermission> {
    if (!isSupported.value) return "denied";
    const result = await Notification.requestPermission();
    permission.value = result;
    return result;
  }

  async function subscribe(): Promise<boolean> {
    if (!isSupported.value) return false;
    if (!VAPID_PUBLIC_KEY) {
      console.warn("[usePushNotifications] VITE_VAPID_PUBLIC_KEY not set");
      return false;
    }

    const perm = await requestPermission();
    if (perm !== "granted") return false;

    try {
      const registration  = await navigator.serviceWorker.ready;
      const subscription  = await registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      await fetch(getApiUrl("/api/push/subscribe"), {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify(subscription.toJSON()),
      });

      isSubscribed.value = true;
      return true;
    } catch (err) {
      console.error("[usePushNotifications] subscribe failed:", err);
      return false;
    }
  }

  async function unsubscribe(): Promise<void> {
    if (!isSupported.value) return;

    try {
      const registration  = await navigator.serviceWorker.ready;
      const subscription  = await registration.pushManager.getSubscription();
      if (!subscription) return;

      await fetch(getApiUrl("/api/push/subscribe"), {
        method:      "DELETE",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ endpoint: subscription.endpoint }),
      });

      await subscription.unsubscribe();
      isSubscribed.value = false;
    } catch (err) {
      console.error("[usePushNotifications] unsubscribe failed:", err);
    }
  }

  async function checkSubscription(): Promise<void> {
    if (!isSupported.value) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      isSubscribed.value = sub !== null;
    } catch { /* ignore */ }
  }

  return { isSupported, permission, isSubscribed, subscribe, unsubscribe, checkSubscription };
}
