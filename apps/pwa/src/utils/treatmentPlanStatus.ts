import type { StatusTone } from "./statusTone";

/**
 * Single source for OrthoApnea treatment-plan status → chip color/label, shared
 * by PatientOrthoApneaPanel (Device tab) and PatientAsidePanel (NEO-153).
 */
export function treatmentPlanStatusColor(status: string): string {
  switch (status) {
    case "completed": return "success";
    case "in_progress":
    case "patient_notified": return "info";
    case "cancelled": return "default";
    case "on_hold": return "warning";
    default: return "warning";
  }
}

export function treatmentPlanStatusLabel(t: (key: string) => string, status: string): string {
  return t(`app.treatmentPlans.status.${status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`);
}

/** A plan saved locally from the order wizard but never sent to OrthoApnea (see OrthoApneaOrderWizard.persistDraft). */
export function isDraftTreatmentPlan(plan: { metadata: Record<string, unknown> | null }): boolean {
  return !!plan.metadata?.orthoapneaDraft;
}

/** NEO-217: the one state a device-order row shows (Sin enviar · Requiere atención · Pedido · Recibido · Cancelado). */
export type DeviceOrderState = "draft" | "attention" | "ordered" | "received" | "cancelled";

export const DEVICE_ORDER_TONE = {
  draft: "partial",
  attention: "attention",
  ordered: "waiting",
  received: "done",
  cancelled: "cancelled",
} as const satisfies Record<DeviceOrderState, StatusTone>;

/** A failed send needs attention; a legacy plan never linked to the lab reads as ordered (it predates the integration). */
export function deviceOrderState(plan: {
  status: string;
  metadata: Record<string, unknown> | null;
  order_sync_status: "pending" | "synced" | "failed" | null;
  appliance_delivered_at: string | null;
}): DeviceOrderState {
  if (isDraftTreatmentPlan(plan)) return "draft";
  if (plan.status === "cancelled") return "cancelled";
  if (plan.status === "completed" || plan.appliance_delivered_at) return "received";
  if (plan.order_sync_status === "failed") return "attention";
  return "ordered";
}

/**
 * NEO-223: an order still in progress — one per patient (the API refuses a second, DEVICE_ORDER_ACTIVE);
 * the clinic follows up on it through its comments. Received and cancelled orders are closed.
 */
export function isActiveDeviceOrder(state: DeviceOrderState): boolean {
  return state === "draft" || state === "attention" || state === "ordered";
}
