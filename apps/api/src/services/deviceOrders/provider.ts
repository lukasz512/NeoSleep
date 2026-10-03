import type { DeliveryAddress, DeviceOrder, ProductCode } from "@neo/device-order";
import type { RemoteOrder } from "./reconcile.js";

/**
 * A device-order provider: the lab that manufactures the appliance. The
 * device-order route (routes/deviceOrders.ts) talks only to this interface,
 * never to a partner module, so the wire format of one partner stays inside
 * its adapter (CORE-95, ADR-028). Today the only implementation is the
 * OrthoApnea one, which drives OA's own portal endpoints; when OA ships a
 * real API, that becomes a second implementation of this same interface and
 * neither the route nor the shared rules (@neo/device-order) change.
 */
export interface DeviceOrderSubmission {
  tenantSlug: string;
  /** Our treatment_plan id — the one order per plan is enforced on it. */
  treatmentPlanId: string;
  /** Our patient id. */
  patientId: string;
  /** Already validated with validateDeviceOrder(). */
  order: DeviceOrder;
  /** The ordering doctor's primary HCO, already validated with validateDeliveryAddress(). */
  delivery: DeliveryAddress;
}

export interface DeviceOrderReceipt {
  externalId: string;
  externalStatus: string | null;
  /** The exact payload the provider received, for the audit log. */
  sentPayload: Record<string, unknown>;
}

export interface DeviceOrderProvider {
  /** Also the `partner_link.partner` value of this provider's links. */
  readonly name: string;
  /** Dotted paths into the provider's wire-format order that the reconciliation compares — the fields we send (NEO-218). */
  readonly comparedPaths: readonly string[];
  /** The subset of comparedPaths compared by day only. */
  readonly comparedDatePaths: readonly string[];
  /** Every order the lab lists for our account. Read-only. Throws when the lab can't be read — never returns a partial list. */
  listRemoteOrders(): Promise<RemoteOrder[]>;
  /** Earliest desired date the provider accepts for the product (YYYY-MM-DD), or null when unknown / unreachable. Never throws. */
  minDesiredDate(productCode: ProductCode): Promise<string | null>;
  /** Places the order. Throws ConflictError (409) when this plan was already submitted or a submit is in flight. */
  submitOrder(submission: DeviceOrderSubmission): Promise<DeviceOrderReceipt>;
}
