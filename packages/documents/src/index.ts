export { documentT, normalizeLocale, SUPPORTED_LOCALES, type Locale } from "./documentI18n.js";
export { renderDocumentHtml, renderDocumentFooterHtml, fillContentParams } from "./documentRender.js";
export { DOCUMENT_MANIFEST, isKnownDocument, type DocumentManifestEntry } from "./documentManifest.js";
export {
  isValidLicenseNumber,
  normalizeLicenseNumber,
  licenseNumberKey,
  licenseCountryForRegion,
  type LicenseCountry,
} from "./browser/index.js";
