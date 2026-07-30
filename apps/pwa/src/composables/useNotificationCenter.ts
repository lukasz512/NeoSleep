import { ref } from "vue";
import { apiFetch } from "./useBffApi";

/**
 * Notification Center — in-app inbox (bell + badge). See ADR-012.
 *
 * Not to be confused with useNotifications.ts, which is the unrelated toast/
 * snackbar hub (ephemeral success/error banners).
 *
 * Module-level shared state (same pattern as useNotifications.ts): the badge
 * count is read from three places at once (bell, sidebar nav, bottom nav),
 * all of which must agree without prop-drilling.
 *
 * Realtime strategy (ADR-012 §3): poll refresh() while the tab is visible,
 * plus web push nudges a refresh when backgrounded. refresh() is the single
 * point where the transport could later move to SSE without touching any
 * component that calls this composable.
 */

export interface CenterNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationApiRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
}

function fromApi(row: NotificationApiRow): CenterNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actionUrl: row.action_url,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

const POLL_INTERVAL_MS = 45_000;

const items = ref<CenterNotification[]>([]);
const total = ref(0);
const unreadCount = ref(0);
const loading = ref(false);
const loadError = ref(false);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollRefCount = 0;

async function fetchUnreadCount(): Promise<void> {
  try {
    const res = await apiFetch("/api/v1/notification/unread-count", { handleErrors: false });
    if (!res.ok) return;
    const data = (await res.json()) as { count: number };
    unreadCount.value = data.count;
  } catch {
    // Silent — badge just stays stale until the next successful poll.
  }
}

async function fetchList(filter: "all" | "unread"): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await apiFetch(`/api/v1/notification?filter=${filter}&limit=30`, { handleErrors: false });
    if (!res.ok) {
      loadError.value = true;
      return;
    }
    const data = (await res.json()) as { items: NotificationApiRow[]; total: number };
    items.value = data.items.map(fromApi);
    total.value = data.total;
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function markRead(id: string): Promise<void> {
  const target = items.value.find((n) => n.id === id);
  if (target?.readAt) return; // already read, avoid a redundant round-trip

  const res = await apiFetch(`/api/v1/notification/${id}/read`, { method: "PATCH", handleErrors: false });
  if (!res.ok) return;

  if (target) target.readAt = new Date().toISOString();
  if (unreadCount.value > 0) unreadCount.value -= 1;
}

async function markAllRead(): Promise<void> {
  const res = await apiFetch("/api/v1/notification/mark-all-read", { method: "POST", handleErrors: false });
  if (!res.ok) return;

  const now = new Date().toISOString();
  items.value = items.value.map((n) => (n.readAt ? n : { ...n, readAt: now }));
  unreadCount.value = 0;
}

/** Single refresh entry point — see module doc comment on why this matters. */
async function refresh(): Promise<void> {
  await fetchUnreadCount();
}

function startPolling(): void {
  pollRefCount += 1;
  if (pollTimer) return;
  void refresh();
  pollTimer = setInterval(() => {
    if (document.visibilityState === "visible") void refresh();
  }, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  pollRefCount = Math.max(0, pollRefCount - 1);
  if (pollRefCount === 0 && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function useNotificationCenter() {
  return {
    items,
    total,
    unreadCount,
    loading,
    loadError,
    fetchList,
    markRead,
    markAllRead,
    refresh,
    startPolling,
    stopPolling,
  };
}
