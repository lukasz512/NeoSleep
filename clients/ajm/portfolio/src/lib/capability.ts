/**
 * "Lite mode": weak device or weak connection. Leads often open the page from a QR code
 * on a phone, sometimes on poor mobile data, so heavy motion and video must degrade
 * to posters and simple fades (decisions R3 + weak-network plan in the CORE-47 story).
 */
export interface DeviceSignals {
  reducedMotion: boolean;
  saveData: boolean;
  /** navigator.connection.effectiveType: "slow-2g" | "2g" | "3g" | "4g" */
  effectiveType?: string;
  /** navigator.deviceMemory in GB (Chrome/Android only) */
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

export function isLiteMode(s: DeviceSignals): boolean {
  if (s.reducedMotion || s.saveData) return true;
  if (s.effectiveType && ["slow-2g", "2g", "3g"].includes(s.effectiveType)) return true;
  if (s.deviceMemory !== undefined && s.deviceMemory < 4) return true;
  if (s.hardwareConcurrency !== undefined && s.hardwareConcurrency < 4) return true;
  return false;
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

export function readDeviceSignals(win: Window = window): DeviceSignals {
  const nav = win.navigator as Navigator & { connection?: NetworkInformationLike; deviceMemory?: number };
  return {
    reducedMotion: win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    saveData: nav.connection?.saveData ?? false,
    effectiveType: nav.connection?.effectiveType,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
  };
}
