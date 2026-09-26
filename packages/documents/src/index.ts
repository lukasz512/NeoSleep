export { documentT, normalizeLocale, SUPPORTED_LOCALES, type Locale } from "./documentI18n.js";
export { renderDocumentHtml, renderDocumentFooterHtml, fillContentParams, fillContentForLocale } from "./documentRender.js";
export { DOCUMENT_MANIFEST, isKnownDocument, getDocumentRefCode, type DocumentManifestEntry } from "./documentManifest.js";
export {
  isValidLicenseNumber,
  normalizeLicenseNumber,
  licenseNumberKey,
  licenseCountryForRegion,
  type LicenseCountry,
  applyDocumentFields,
  type DocumentFieldValues,
} from "./browser/index.js";
