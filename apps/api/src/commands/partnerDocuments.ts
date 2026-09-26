import type { PoolClient } from "pg";
import { renderDocumentHtml, renderDocumentFooterHtml } from "@neo/documents";
import type { TenantContext } from "../context/TenantContext.js";
import { withPlatform } from "../db/tenant.js";
import {
  getCurrentDocumentContentVersion,
  getDocumentContentVersionById,
  type DocumentContentVersionRow,
} from "../db/documentContent.js";
import {
  getPartnerSignatoryConfig,
  setApprovedPartnerVersion,
  approvalKey,
  jurisdictionLocale,
  localeJurisdiction,
  type PartnerJurisdiction,
  type PartnerSignatory,
} from "../db/partnerSignatories.js";
import { insertAuditLog } from "../db.js";
import { getTerritoryCountryCode } from "../db/territory.js";
import { getOrganizationById } from "../db/organization.js";
import { downloadPartnerDocument } from "../services/partnerDocuments.js";
import {
  ForbiddenError,
  NotFoundError,
  PartnerDocumentsNotReadyError,
  ValidationError,
} from "../errors.js";

/**
 * Partner onboarding documents (NEO-51) — shared by activation, the
 * token-gated preview, and invite acceptance, so all three agree on which
 * texts are signable and render them the same way.
 *
 * Two documents per jurisdiction (PL / MX, locale pl / mx):
 *   1. the partner agreement with Annex 1 (data processing agreement) —
 *      ONE PDF, pre-signed by NeoSleep's signatory, signed by the doctor;
 *   2. the privacy notice — acknowledged, not signed.
 *
 * Only a content version the jurisdiction's signatory has approved can carry
 * their signature: resolvePartnerDocumentSet refuses otherwise.
 */

/** Templates whose text the NeoSleep signatory countersigns — each needs an approved version. */
export const COUNTERSIGNED_TEMPLATES = ["partnerAgreement", "partnerDpa"] as const;

export function partnerJurisdictionForRegion(region: string | null | undefined): PartnerJurisdiction | null {
  const r = (region ?? "").trim().toUpperCase();
  return r === "PL" || r === "MX" ? r : null;
}

interface JurisdictionSource {
  region: string | null;
  country_code: string | null;
  territory_id: string | null;
}

/** The country above a territory node (e.g. MX for "mx/cdmx/polanco"). */
async function territoryJurisdiction(client: PoolClient, territoryId: string | null): Promise<PartnerJurisdiction | null> {
  if (!territoryId) return null;
  return partnerJurisdictionForRegion(await getTerritoryCountryCode(client, territoryId));
}

async function sourceJurisdiction(client: PoolClient, source: JurisdictionSource): Promise<PartnerJurisdiction | null> {
  return (
    partnerJurisdictionForRegion(source.region) ??
    partnerJurisdictionForRegion(source.country_code) ??
    (await territoryJurisdiction(client, source.territory_id))
  );
}

/**
 * Which country's partner documents a practitioner signs. Region alone was
 * too narrow: a doctor added under a territory ("mx/cdmx") or with only a
 * country code, or whose clinic carries the country, got "only available for
 * PL or MX" (Łukasz, 2026-09-25). Order: the practitioner's own region →
 * country code → territory's country → the same three on their clinic.
 */
export async function resolvePractitionerJurisdiction(
  client: PoolClient,
  practitioner: JurisdictionSource & { organization_id: string | null },
): Promise<PartnerJurisdiction | null> {
  const own = await sourceJurisdiction(client, practitioner);
  if (own || !practitioner.organization_id) return own;
  const organization = await getOrganizationById(client, practitioner.organization_id);
  return organization ? sourceJurisdiction(client, organization) : null;
}

export interface PartnerDocumentSet {
  jurisdiction: PartnerJurisdiction;
  locale: "pl" | "mx";
  signatory: PartnerSignatory;
  agreement: DocumentContentVersionRow;
  dpa: DocumentContentVersionRow;
  notice: DocumentContentVersionRow;
}

export async function resolvePartnerDocumentSet(
  client: PoolClient,
  jurisdiction: PartnerJurisdiction,
): Promise<PartnerDocumentSet> {
  const config = await getPartnerSignatoryConfig(client);
  const signatory = config.signatories[jurisdiction];
  if (!signatory) {
    throw new PartnerDocumentsNotReadyError(`No NeoSleep signatory is configured for ${jurisdiction}`);
  }

  const locale = jurisdictionLocale(jurisdiction);
  const [agreement, dpa, notice] = await withPlatform(async (platform) => [
    await getCurrentDocumentContentVersion(platform, "partnerAgreement", locale),
    await getCurrentDocumentContentVersion(platform, "partnerDpa", locale),
    await getCurrentDocumentContentVersion(platform, "partnerPrivacyNotice", locale),
  ]);
  if (!agreement || !dpa || !notice) {
    throw new PartnerDocumentsNotReadyError(`Partner documents for ${jurisdiction} have no content yet`);
  }
  for (const version of [agreement, dpa]) {
    if (config.approvedVersions[approvalKey(version.template_key, locale)] !== version.id) {
      throw new PartnerDocumentsNotReadyError(
        `The current ${version.template_key} (${locale}) version ${version.version_number} is not approved by ${signatory.printedName} yet`,
      );
    }
  }
  return { jurisdiction, locale, signatory, agreement, dpa, notice };
}

/** Signatory PNG as a data URL — cached per storage path for the process lifetime. */
const signatureCache = new Map<string, string>();

export async function loadSignatoryPngDataUrl(signatory: PartnerSignatory): Promise<string> {
  const cached = signatureCache.get(signatory.signaturePath);
  if (cached) return cached;
  const bytes = await downloadPartnerDocument(signatory.signaturePath);
  const dataUrl = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
  signatureCache.set(signatory.signaturePath, dataUrl);
  return dataUrl;
}

const DATE_LOCALES: Record<"pl" | "mx", { tag: string; timeZone: string }> = {
  pl: { tag: "pl-PL", timeZone: "Europe/Warsaw" },
  mx: { tag: "es-MX", timeZone: "America/Mexico_City" },
};

/** Human date for a legal document, in the jurisdiction's language and time zone (e.g. "24 września 2026"). */
export function formatDocumentDate(date: Date, locale: "pl" | "mx"): string {
  const { tag, timeZone } = DATE_LOCALES[locale];
  return new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone }).format(date);
}

export type PracticeRole = "owner" | "staff";

export interface PartnerParty {
  doctorName: string;
  licenseNumber: string;
  clinicName: string;
  taxId: string;
  clinicAddress: string;
  email: string;
  practiceRole: PracticeRole;
}

export interface RenderedPartnerDocument {
  html: string;
  footerHtml: string;
  dataFields: Record<string, string>;
  imageFields: Record<string, string>;
  variant: string | null;
}

/**
 * Builds the agreement (+ Annex 1) exactly as it will be signed. Without a
 * signer signature / signing date it's the preview: NeoSleep's signature and
 * date are already there, the partner's date reads as the pending placeholder
 * the caller passes in.
 */
export async function buildAgreementDocument(
  set: PartnerDocumentSet,
  party: PartnerParty,
  dates: { counterpartySignedAt: Date; signerSignedAt: string },
  signerSignatureDataUrl?: string,
): Promise<RenderedPartnerDocument> {
  const html = renderDocumentHtml("partnerAgreement", set.locale, set.agreement.content_html, {
    annex: set.dpa.content_html,
  });
  const imageFields: Record<string, string> = {
    counterparty_signature: await loadSignatoryPngDataUrl(set.signatory),
  };
  if (signerSignatureDataUrl) imageFields.signer_signature = signerSignatureDataUrl;
  const docRef = `NSL-PA-${set.jurisdiction} v${set.agreement.version_number}.${set.dpa.version_number}`;
  return {
    html,
    footerHtml: renderDocumentFooterHtml(docRef, set.locale, { subject: party.doctorName }),
    dataFields: {
      doc_ref: docRef,
      doctor_name: party.doctorName,
      license_number: party.licenseNumber,
      clinic_name: party.clinicName,
      tax_id: party.taxId,
      clinic_address: party.clinicAddress,
      email: party.email,
      counterparty_name: set.signatory.printedName,
      counterparty_signed_at: formatDocumentDate(dates.counterpartySignedAt, set.locale),
      signer_signed_at: dates.signerSignedAt,
    },
    imageFields,
    variant: party.practiceRole,
  };
}

export function buildNoticeDocument(
  set: PartnerDocumentSet,
  doctorName: string,
  acknowledgedAt: string,
): RenderedPartnerDocument {
  const docRef = `NSL-PN-${set.jurisdiction} v${set.notice.version_number}`;
  return {
    html: renderDocumentHtml("partnerPrivacyNotice", set.locale, set.notice.content_html),
    footerHtml: renderDocumentFooterHtml(docRef, set.locale, { subject: doctorName }),
    dataFields: { doc_ref: docRef, doctor_name: doctorName, acknowledged_at: acknowledgedAt },
    imageFields: {},
    variant: null,
  };
}

// ---------------------------------------------------------------------------
// APPROVE A VERSION — the signatory authorises their signature on this text
// ---------------------------------------------------------------------------

export async function ApprovePartnerDocumentVersionCommand(
  ctx: TenantContext,
  templateKey: string,
  locale: string,
  versionId: string,
): Promise<{ versionId: string; versionNumber: number }> {
  if (!(COUNTERSIGNED_TEMPLATES as readonly string[]).includes(templateKey)) {
    throw new ValidationError(`${templateKey} is not a countersigned document`);
  }
  const jurisdiction = localeJurisdiction(locale);
  if (!jurisdiction) throw new ValidationError(`No partner jurisdiction for locale "${locale}"`);

  const config = await getPartnerSignatoryConfig(ctx.client);
  const signatory = config.signatories[jurisdiction];
  if (!signatory) throw new PartnerDocumentsNotReadyError(`No NeoSleep signatory is configured for ${jurisdiction}`);
  if (signatory.approverUserId !== ctx.user.id) {
    throw new ForbiddenError(`Only ${signatory.printedName} can approve ${jurisdiction} partner documents`);
  }

  const version = await withPlatform((platform) => getDocumentContentVersionById(platform, versionId));
  if (!version || version.template_key !== templateKey || version.locale !== locale) {
    throw new NotFoundError("Document content version", versionId);
  }
  if (!version.is_current) {
    throw new ValidationError("Only the current version can be approved");
  }

  await setApprovedPartnerVersion(ctx.client, templateKey, locale, version.id);
  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "approve_and_countersign",
    entity_type: "DocumentContentVersion",
    entity_id: version.id,
    entity_after: {
      template_key: templateKey,
      locale,
      version_number: version.version_number,
      signatory: signatory.printedName,
    },
    request_id: ctx.requestId,
  });
  return { versionId: version.id, versionNumber: version.version_number };
}

export interface PartnerApprovalStatus {
  templateKey: string;
  locale: string;
  jurisdiction: PartnerJurisdiction;
  signatoryName: string | null;
  canApprove: boolean;
  approvedVersionId: string | null;
}

/** For the Documents editor: who signs this template, whether the current user may approve, and which version is approved. */
export async function GetPartnerApprovalStatusQuery(
  ctx: TenantContext,
  templateKey: string,
  locale: string,
): Promise<PartnerApprovalStatus | null> {
  if (!(COUNTERSIGNED_TEMPLATES as readonly string[]).includes(templateKey)) return null;
  const jurisdiction = localeJurisdiction(locale);
  if (!jurisdiction) return null;
  const config = await getPartnerSignatoryConfig(ctx.client);
  const signatory = config.signatories[jurisdiction] ?? null;
  return {
    templateKey,
    locale,
    jurisdiction,
    signatoryName: signatory?.printedName ?? null,
    canApprove: signatory?.approverUserId === ctx.user.id,
    approvedVersionId: config.approvedVersions[approvalKey(templateKey, locale)] ?? null,
  };
}
