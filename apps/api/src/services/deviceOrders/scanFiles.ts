import { randomUUID } from "node:crypto";

/**
 * Where a device order's scan files live in the private documents bucket
 * (NEO-262). They are keyed by patient, not by treatment plan, because the
 * doctor uploads in the wizard before the plan exists (it is created on
 * "save draft" or on submit). The API issues every path, and on submit it
 * accepts only paths under the order's own tenant and patient.
 */
export function scanFilePrefix(tenantSlug: string, patientId: string): string {
  return `${tenantSlug}/device-orders/patients/${patientId}/scans/`;
}

/** A fresh path for an upload: a uuid keeps two files with one name apart, and the name stays readable. */
export function newScanFilePath(tenantSlug: string, patientId: string, fileName: string): string {
  const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-120) || "scan";
  return `${scanFilePrefix(tenantSlug, patientId)}${randomUUID()}-${safe}`;
}

/** True only for a path this API could have issued for this tenant and patient. */
export function isOwnScanFilePath(path: string, tenantSlug: string, patientId: string): boolean {
  const prefix = scanFilePrefix(tenantSlug, patientId);
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/") && !rest.includes("..");
}
