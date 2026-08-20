import { apiFetch } from "./useApi";
import { useNotifications } from "./useNotifications";
import { i18n } from "../plugins/i18n";

/**
 * Generic "is this partner reachable" check, meant to be reused by every
 * partner integration (OrthoApnea today; Biologix/WatchPAT later), not just
 * OrthoApnea. Each partner backend exposes `GET /api/v1/partners/<partner>/status`
 * (see routes/partners/orthoapnea-status.ts) — attempts a reconnect if
 * needed, no-ops if already connected, never throws.
 *
 * Called from the router guard (router/index.ts) on navigation into any
 * route tagged `meta.partner`, not from the views themselves — this is
 * fire-and-forget, so it never blocks navigation, and the view's own load()
 * still shows its own inline error state (with its own "report incident"
 * CTA) regardless of this notification.
 */

const PARTNER_DISPLAY_NAMES: Record<string, string> = {
  orthoapnea: "OrthoApnea",
};

function partnerDisplayName(partner: string): string {
  return PARTNER_DISPLAY_NAMES[partner] ?? partner;
}

interface ConnectionStatus {
  connected: boolean;
  attemptsExhausted: boolean;
}

/** One toast per partner per cooldown window — repeatedly bouncing between two OrthoApnea-tagged routes while it's down shouldn't spam a notification on every navigation. */
const NOTIFY_COOLDOWN_MS = 30_000;
const lastNotifiedAt = new Map<string, number>();

async function checkPartnerConnection(partner: string): Promise<ConnectionStatus> {
  try {
    const res = await apiFetch(`/api/v1/partners/${partner}/status`, { handleErrors: false });
    if (!res.ok) return { connected: false, attemptsExhausted: false };
    return (await res.json()) as ConnectionStatus;
  } catch {
    return { connected: false, attemptsExhausted: false };
  }
}

/**
 * Triggers the reconnect-if-needed check and shows a warning toast on
 * failure (rate-limited per partner). Never throws, never blocks the
 * caller. After repeated consecutive failures (attemptsExhausted, see
 * orthoapnea.ts), the message switches from "still retrying" to "this
 * looks like a real outage — try reloading" since a doctor bouncing
 * between routes deserves to know the difference.
 */
export async function ensurePartnerConnection(partner: string): Promise<void> {
  const status = await checkPartnerConnection(partner);
  if (status.connected) return;

  const now = Date.now();
  const last = lastNotifiedAt.get(partner) ?? 0;
  if (now - last < NOTIFY_COOLDOWN_MS) return;
  lastNotifiedAt.set(partner, now);

  const key = status.attemptsExhausted ? "app.partners.connectionErrorPersistent" : "app.partners.connectionError";
  useNotifications().show(
    i18n.global.t(key, { partner: partnerDisplayName(partner) }),
    "warning",
  );
}
