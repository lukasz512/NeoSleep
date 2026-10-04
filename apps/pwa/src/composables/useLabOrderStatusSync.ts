import { isOfflineError, reportCaught, reportFailedResponse } from "@api";
import { onMounted } from "vue";
import { backgroundApiFetch } from "./useApi";
import { useNotificationCenter } from "./useNotificationCenter";
import { useVisiblePolling } from "./useVisiblePolling";

/** While the app is open; the API throttles to the same window per tenant, the scheduled job covers the rest (4x a day). */
export const LAB_ORDER_SYNC_INTERVAL_MS = 15 * 60_000;

interface SyncResponse {
  ran: boolean;
  changed?: number;
}

/**
 * Asks the API to refresh device order statuses from the lab (CORE-67): once
 * when the app opens, then every 15 min while it is visible. Silent: no
 * loader, no toast. A changed status creates a notification server-side, so
 * the bell badge is refreshed right away instead of on its next poll.
 */
export async function syncLabOrderStatuses(): Promise<void> {
  try {
    const res = await backgroundApiFetch("/api/v1/partners/orthoapnea/sync-statuses", { method: "POST", handleErrors: false });
    if (!res.ok) {
      await reportFailedResponse(res, { where: "useLabOrderStatusSync" });
      return;
    }
    const data = (await res.json()) as SyncResponse;
    if (data.ran && (data.changed ?? 0) > 0) await useNotificationCenter().refresh();
  } catch (err) {
    // Offline is expected on a phone; the next tick tries again.
    if (!isOfflineError(err)) reportCaught(err, { where: "useLabOrderStatusSync" });
  }
}

/** Mount once for the signed-in session (AppLayout). */
export function useLabOrderStatusSync(): void {
  useVisiblePolling(() => LAB_ORDER_SYNC_INTERVAL_MS, syncLabOrderStatuses);
  onMounted(() => void syncLabOrderStatuses());
}
