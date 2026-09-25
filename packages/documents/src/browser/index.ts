/**
 * Browser-safe entry point of @neo/documents — nothing under src/browser/
 * may import Node built-ins (fs/path), so apps/pwa can import it directly
 * through the `@documents-browser` alias (vite.shared.ts). apps/api reaches
 * the same code through the package's main entry (src/index.ts re-exports).
 */
export {
  isValidLicenseNumber,
  normalizeLicenseNumber,
  licenseNumberKey,
  licenseCountryForRegion,
  type LicenseCountry,
} from "./licenseNumber.js";
export { applyDocumentFields, type DocumentFieldValues } from "./documentFields.js";
