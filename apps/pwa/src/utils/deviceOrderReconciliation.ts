/**
 * View model for the device-order reconciliation card (NEO-218). The API
 * (GET /api/v1/device-orders/reconciliation/latest) gives an admin the full
 * run and a manager the counter only; this turns either into what the card
 * shows. Pure, so the states are unit-tested without mounting anything.
 */

export type ReconciliationReason =
  | "matched"
  | "missing_in_lab"
  | "field_drift"
  | "untracked"
  | "submission_pending"
  | "test_order"
  | "other_env"
  | "unknown_env"
  | "outside";

export interface ReconciliationItemDto {
  reason: ReconciliationReason;
  externalId: string | null;
  treatmentPlanId: string | null;
  patientId: string | null;
  patientName: string | null;
  labStatus: string | null;
  requestDate: string | null;
  drift: { field: string; ours: string; lab: string }[];
}

export interface ReconciliationRunDto {
  id: string;
  trigger: "manual" | "scheduled";
  status: "ok" | "mismatch" | "failed";
  summary: { oursSent?: number; labTotal?: number; matched?: number; mismatches?: number; info?: number; matchLevel?: number | null };
  items?: ReconciliationItemDto[];
  error: string | null;
  finished_at: string;
}

export interface ReconciliationCounterDto {
  status: "ok" | "mismatch" | "failed";
  matchLevel: number | null;
  matched: number;
  mismatches: number;
  finishedAt: string;
}

export interface LatestReconciliationDto {
  environment: string;
  counter: ReconciliationCounterDto | null;
  run?: ReconciliationRunDto | null;
}

export const MISMATCH_REASONS: readonly ReconciliationReason[] = ["missing_in_lab", "field_drift", "untracked", "submission_pending"];

export type CardState = "never" | "ok" | "mismatch" | "failed";

export interface ReconciliationView {
  state: CardState;
  /** "100 %" style, or null when nothing was compared. */
  percent: number | null;
  finishedAt: string | null;
  trigger: "manual" | "scheduled" | null;
  counts: { oursSent: number; labTotal: number; matched: number; mismatches: number; info: number } | null;
  error: string | null;
  /** Orders that need a look, then the ones only explained (info). Matched orders are not listed. */
  attention: ReconciliationItemDto[];
  explained: ReconciliationItemDto[];
}

export function reconciliationView(latest: LatestReconciliationDto | null): ReconciliationView {
  const counter = latest?.counter ?? null;
  const run = latest?.run ?? null;
  if (!counter) {
    return { state: "never", percent: null, finishedAt: null, trigger: null, counts: null, error: null, attention: [], explained: [] };
  }
  const items = run?.items ?? [];
  const s = run?.summary;
  return {
    state: counter.status,
    percent: counter.matchLevel === null ? null : Math.round(counter.matchLevel * 100),
    finishedAt: counter.finishedAt,
    trigger: run?.trigger ?? null,
    counts: s
      ? { oursSent: s.oursSent ?? 0, labTotal: s.labTotal ?? 0, matched: s.matched ?? 0, mismatches: s.mismatches ?? 0, info: s.info ?? 0 }
      : null,
    error: run?.error ?? null,
    attention: items.filter((i) => MISMATCH_REASONS.includes(i.reason)),
    explained: items.filter((i) => i.reason !== "matched" && !MISMATCH_REASONS.includes(i.reason)),
  };
}
