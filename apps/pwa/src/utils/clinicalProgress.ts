import { ahiSeverity, type AhiSeverity } from "./ahiSeverity";

/** Same states as AppSegmentProgress's segments (its own type lives in the .vue file, out of tsc's reach). */
type SegmentState = "done" | "waiting" | "partial" | "current" | "todo";

/**
 * The doctor's Estudios / Tratamientos lists: how a row's protocol progress
 * (computed by the API, apps/api/src/db/clinicalQueues.ts) reads on screen.
 * Mirrors the care protocol's 5 visits (docs/clinical/protocolo-atencion).
 */

export type TreatmentStage = "scan" | "delivery" | "control_1" | "control_2" | "follow_up" | "done";
export type TreatmentQueue = "action" | "active" | "follow_up" | "done";

export interface TreatmentProgress {
  stage: TreatmentStage;
  queue: TreatmentQueue;
  needs_action: boolean;
  overdue: boolean;
  due_at: string | null;
  next_visit_at: string | null;
  delivered_at: string | null;
  advance_level: number | null;
  ahi_baseline: number | null;
  ahi_latest: number | null;
}

export type StudyStep =
  | "hand_sensor"
  | "recording"
  | "sensor_overdue"
  | "awaiting_results"
  | "to_interpret"
  | "schedule_scan"
  | "plan_started"
  | "not_candidate"
  | "review_discharge"
  | "discharged"
  | "cancelled";

export interface StudyProgress {
  phase: "initial" | "control";
  next_step: StudyStep;
  queue: "action" | "active" | "done";
  needs_action: boolean;
}

export const TREATMENT_QUEUE_OPTIONS = [
  { value: "action", labelKey: "app.clinicalQueues.queue.action" },
  { value: "active", labelKey: "app.clinicalQueues.queue.active" },
  { value: "follow_up", labelKey: "app.clinicalQueues.queue.followUp" },
  { value: "done", labelKey: "app.clinicalQueues.queue.done" },
];

export const STUDY_QUEUE_OPTIONS = [
  { value: "action", labelKey: "app.clinicalQueues.queue.action" },
  { value: "active", labelKey: "app.clinicalQueues.queue.active" },
  { value: "done", labelKey: "app.clinicalQueues.queue.done" },
];

/** Protocol visit (1–5) each stage is heading to; the first visit (assessment + study) is behind every plan. */
const STAGE_VISIT: Record<TreatmentStage, number> = {
  scan: 2,
  delivery: 3,
  control_1: 4,
  control_2: 5,
  follow_up: 6,
  done: 6,
};

/** Five segments, one per protocol visit: done before the current one, the current one highlighted. */
export function treatmentSegments(stage: TreatmentStage): SegmentState[] {
  const current = STAGE_VISIT[stage];
  return [1, 2, 3, 4, 5].map((visit) => (visit < current ? "done" : visit === current ? "current" : "todo"));
}

/** 1, 3 or 6 when the next follow-up is the protocol's 1/3/6-month control; null for the periodic ones after. */
export function followUpMonths(deliveredAt: string | null, dueAt: string | null): 1 | 3 | 6 | null {
  if (!deliveredAt || !dueAt) return null;
  const months = Math.round((new Date(dueAt).getTime() - new Date(deliveredAt).getTime()) / (30.44 * 86_400_000));
  return months === 1 || months === 3 || months === 6 ? months : null;
}

/** i18n key + params for the stage line ("Cita 3 · Entrega", "Seguimiento · 3 meses"). */
export function treatmentStageLabel(p: Pick<TreatmentProgress, "stage" | "delivered_at" | "due_at">): {
  key: string;
  params: Record<string, number>;
} {
  if (p.stage === "follow_up") {
    const months = followUpMonths(p.delivered_at, p.due_at);
    return months
      ? { key: "app.clinicalQueues.stage.followUpMonths", params: { months } }
      : { key: "app.clinicalQueues.stage.followUpPeriodic", params: {} };
  }
  if (p.stage === "done") return { key: "app.clinicalQueues.stage.done", params: {} };
  const camel = p.stage.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  return { key: `app.clinicalQueues.stage.${camel}`, params: { visit: STAGE_VISIT[p.stage] } };
}

export type NextVisitLine =
  | { kind: "sendOrder" }
  | { kind: "checkOrder" }
  | { kind: "booked"; at: string }
  | { kind: "overdue"; at: string }
  | { kind: "unbooked"; at: string | null }
  | { kind: "expected"; at: string }
  | { kind: "none" };

/** What the "Próxima cita" cell says, most urgent first. `attention` lines are drawn in the warning colour. */
export function nextVisitLine(p: TreatmentProgress, orderFailed: boolean): NextVisitLine {
  if (p.stage === "done") return { kind: "none" };
  if (p.stage === "scan") return { kind: "sendOrder" };
  if (orderFailed) return { kind: "checkOrder" };
  if (p.next_visit_at) return { kind: "booked", at: p.next_visit_at };
  if (p.overdue && p.due_at) return { kind: "overdue", at: p.due_at };
  if (p.needs_action) return { kind: "unbooked", at: p.due_at };
  if (p.due_at) return { kind: "expected", at: p.due_at };
  return { kind: "none" };
}

export function isAttentionLine(line: NextVisitLine): boolean {
  return line.kind === "sendOrder" || line.kind === "checkOrder" || line.kind === "overdue" || line.kind === "unbooked";
}

/** Percent the AHI fell from the first study to the latest (positive = better); null without both. */
export function ahiImprovement(baseline: number | null, latest: number | null): number | null {
  if (baseline === null || latest === null || baseline <= 0) return null;
  return Math.round(((baseline - latest) / baseline) * 100);
}

/**
 * The Estudios "Resultado" cell (decision D3, 2026-10-05): the numbers show as soon as they
 * arrive, but until the pulmonologist interprets them they carry "pendiente de neumólogo"
 * instead of a severity — the dentist sees the AHI, the diagnosis stays the pulmonologist's.
 */
export function studyResult(study: { status: string; ahi_score: number | null }):
  | { kind: "none" }
  | { kind: "pending"; ahi: number }
  | { kind: "interpreted"; ahi: number; severity: AhiSeverity } {
  if (study.ahi_score === null || study.ahi_score === undefined) return { kind: "none" };
  if (study.status === "interpreted") return { kind: "interpreted", ahi: study.ahi_score, severity: ahiSeverity(study.ahi_score) };
  return { kind: "pending", ahi: study.ahi_score };
}

const STUDY_ATTENTION: ReadonlySet<StudyStep> = new Set(["sensor_overdue", "to_interpret", "schedule_scan", "review_discharge"]);

export function isStudyAttention(step: StudyStep): boolean {
  return STUDY_ATTENTION.has(step);
}

export function studyStepKey(step: StudyStep): string {
  return `app.clinicalQueues.studyStep.${step.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;
}

/** The date a study step waits from: when results arrived, or when the sensor went home. */
export function studyStepSince(study: {
  results_received_at: string | null;
  device_delivered_at: string | null;
  interpreted_at: string | null;
}, step: StudyStep): string | null {
  if (step === "to_interpret") return study.results_received_at;
  if (step === "sensor_overdue" || step === "recording") return study.device_delivered_at;
  if (step === "schedule_scan" || step === "review_discharge") return study.interpreted_at;
  return null;
}
