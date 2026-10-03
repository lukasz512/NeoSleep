import { SCANNER_PLATFORMS, SCANNER_TREATMENTS, type ScannerPlatform, type ScannerTreatment } from "@device-order";

/**
 * The scanner pickers of the device-order wizard (Łukasz D2, 2026-10-03):
 * the doctor sees a brand name, the order carries OA's enum NAME (enums `ba`
 * scanners / `bZ` platforms, docs/partners/orthoapnea-order-rules.md). Brand
 * and product names are proper nouns, not translated copy; the one generic
 * entry ("Unknown") has an i18n key instead.
 */

/** The intraoral scanners the wizard offers — the same list it showed before, now as OA names. */
export const WIZARD_SCANNERS: readonly ScannerTreatment[] = [
  "AORALSCAN_SHINING_3D",
  "CARESTREAM",
  "DENTALWINGS",
  "HERON",
  "ITERO",
  "MEDIT",
  "NEOSCAN_1000",
  "SIRONA",
  "PLANMECA_EMERALD",
  "SHAPE_TRIOS",
  "SHINING_3D",
  "UNKNOWN",
];

/** Brand label per scanner name; UNKNOWN is translated (UNKNOWN_SCANNER_I18N_KEY). */
export const SCANNER_BRANDS: Readonly<Partial<Record<ScannerTreatment, string>>> = {
  AORALSCAN_SHINING_3D: "Aoralscan Shining 3D",
  CARESTREAM: "Carestream",
  DENTALWINGS: "Dental Wings",
  HERON: "Heron",
  ITERO: "iTero",
  MEDIT: "Medit",
  NEOSCAN_1000: "NeoScan 1000",
  SIRONA: "Sirona",
  PLANMECA_EMERALD: "Planmeca Emerald",
  SHAPE_TRIOS: "3Shape Trios",
  SHINING_3D: "Shining 3D",
};

export const UNKNOWN_SCANNER_I18N_KEY = "app.deviceOrder.registration.unknownScanner";

/** Every OA scanner platform, with its product name. */
export const PLATFORM_BRANDS: Readonly<Record<ScannerPlatform, string>> = {
  SHAPE_COMMUNICATE: "3Shape Communicate",
  SIRONA_CONNECT: "Sirona Connect",
  ITERO_RESTAURATIVE: "iTero Restorative",
  CSCONNECT: "CS Connect",
  MEDIT_LINK: "Medit Link",
  DWOS_CONNECT: "DWOS Connect",
  HERON_CLOUD: "Heron Cloud",
  ROMEXIS_CLOUD: "Romexis Cloud",
  SHINING_3D_DENTAL_CLOUD: "Shining 3D Dental Cloud",
  DEXIS_IS: "DEXIS IS",
};

export function isScannerTreatment(value: unknown): value is ScannerTreatment {
  return typeof value === "string" && (SCANNER_TREATMENTS as readonly string[]).includes(value);
}

export function isScannerPlatform(value: unknown): value is ScannerPlatform {
  return typeof value === "string" && (SCANNER_PLATFORMS as readonly string[]).includes(value);
}

/**
 * Drafts saved before D2 stored the scanner as the brand label the picker
 * showed (e.g. "3Shape Trios"). Maps such a label — or an OA name — to OA's
 * name; null otherwise (the old untranslated "unknown" entry included), and
 * the doctor picks again.
 */
export function scannerFromLegacyLabel(value: unknown): ScannerTreatment | null {
  if (isScannerTreatment(value)) return value;
  if (typeof value !== "string") return null;
  const label = value.trim().toLowerCase();
  const match = Object.entries(SCANNER_BRANDS).find(([, brand]) => brand.toLowerCase() === label);
  return match && isScannerTreatment(match[0]) ? match[0] : null;
}
