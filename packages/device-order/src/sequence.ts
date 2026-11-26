import { PRODUCT_CODES, type DeviceOrder, type ProductCode } from "./model.js";

/** OA rounds every mm value to 0.1 (render2Decimal, rules §1.3). */
export function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Starting point in mm, as OA stores it. A % value is converted the way OA's
 * form does: MR + %·(MP − MR)/100, rounded to 0.1 (rules §8.10). Null when
 * nothing usable was entered.
 */
export function startingPointMm(order: Pick<DeviceOrder, "retrusionMaxMm" | "protrusionMaxMm" | "startingPoint">): number | null {
  const { value, unit } = order.startingPoint;
  if (value === null || Number.isNaN(value)) return null;
  if (unit === "mm") return roundMm(value);
  return roundMm(order.retrusionMaxMm + (value * (order.protrusionMaxMm - order.retrusionMaxMm)) / 100);
}

/** How many main lower splints follow SP: 3 for NOA, 2 for NOA TMJ (rules §2). */
export function mainSplintCount(productCode: ProductCode): number {
  return productCode === PRODUCT_CODES.NOA ? 3 : 2;
}

/**
 * OA's standard sequence, shown read-only when "Estándar" is chosen
 * (standardDes / standardDesNoaTmj): SP, −1, +1, +2 mm for NOA and SP, −1, +1
 * for NOA TMJ — offsets relative to SP.
 */
export function standardSequenceOffsets(productCode: ProductCode): number[] {
  return productCode === PRODUCT_CODES.NOA ? [-1, 1, 2] : [-1, 1];
}
