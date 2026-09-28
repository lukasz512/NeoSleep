/**
 * Device-order progress for the patient avatar's stage ring (NEO-155).
 * Steps follow purchase_order.status in order; cancelled/refunded (and any
 * unknown value) get no ring — only a live order is shown.
 */
export const DEVICE_ORDER_STEPS = ["pending", "paid", "processing", "shipped", "delivered"] as const;

export type DeviceOrderStatus = (typeof DEVICE_ORDER_STEPS)[number];

function isDeviceOrderStatus(status: string): status is DeviceOrderStatus {
  return (DEVICE_ORDER_STEPS as readonly string[]).includes(status);
}

/** Fraction of the ring to fill (0 < n <= 1), or null when there is no ring to draw. */
export function deviceOrderProgress(status: string | null | undefined): number | null {
  if (!status || !isDeviceOrderStatus(status)) return null;
  return (DEVICE_ORDER_STEPS.indexOf(status) + 1) / DEVICE_ORDER_STEPS.length;
}
