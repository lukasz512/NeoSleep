import type { DeviceOrderProvider } from "./provider.js";
import { orthoApneaDeviceOrderProvider } from "./orthoapnea/provider.js";

export type { DeviceOrderProvider, DeviceOrderReceipt, DeviceOrderSubmission } from "./provider.js";

/** The lab that receives device orders. One today (OrthoApnea); per-tenant choice comes when a second lab does. */
export function getDeviceOrderProvider(): DeviceOrderProvider {
  return orthoApneaDeviceOrderProvider;
}
