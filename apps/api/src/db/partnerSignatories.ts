import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";

/**
 * NeoSleep-side signatory config for the partner onboarding documents
 * (NEO-51), per tenant, stored in the tenant's app_config.metadata JSONB
 * under "partnerSignatories" — no schema change, and per-tenant because a
 * white-label tenant signs with its own people:
 *
 *   {
 *     "signatories": {
 *       "PL": { printedName, signaturePath, approverUserId, ccEmail },
 *       "MX": { ... }
 *     },
 *     "approvedVersions": { "partnerAgreement.pl": "<content version id>", ... }
 *   }
 *
 * - `signaturePath` is an object path in the PRIVATE documents bucket
 *   (never a public URL) — uploaded by scripts/setupPartnerSignatories.ts.
 * - `approverUserId` is the only user who may approve a content version for
 *   that jurisdiction — approving is what authorises the system to apply
 *   their signature image to that exact text (the /legal guardrail: an admin
 *   editing the agreement in the Documents tab must never get the
 *   signatory's signature on text the signatory hasn't seen).
 * - `ccEmail` receives NeoSleep's copy of every signed document.
 */

export type PartnerJurisdiction = "PL" | "MX";

export interface PartnerSignatory {
  printedName: string;
  signaturePath: string;
  approverUserId: string;
  ccEmail: string;
}

export interface PartnerSignatoryConfig {
  signatories: Partial<Record<PartnerJurisdiction, PartnerSignatory>>;
  approvedVersions: Record<string, string>;
}

/** Locale the jurisdiction's documents are written in — jurisdiction == locale for partner documents. */
export function jurisdictionLocale(jurisdiction: PartnerJurisdiction): "pl" | "mx" {
  return jurisdiction === "PL" ? "pl" : "mx";
}

/** Inverse of jurisdictionLocale — null for any other locale (e.g. "en"). */
export function localeJurisdiction(locale: string): PartnerJurisdiction | null {
  if (locale === "pl") return "PL";
  if (locale === "mx") return "MX";
  return null;
}

/** Key used in approvedVersions for one template/locale pair. */
export function approvalKey(templateKey: string, locale: string): string {
  return `${templateKey}.${locale}`;
}

function isSignatory(value: unknown): value is PartnerSignatory {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.printedName === "string" &&
    typeof v.signaturePath === "string" &&
    typeof v.approverUserId === "string" &&
    typeof v.ccEmail === "string"
  );
}

export async function getPartnerSignatoryConfig(client: PoolClient): Promise<PartnerSignatoryConfig> {
  try {
    const r = await client.query<{ cfg: unknown }>(
      `SELECT metadata->'partnerSignatories' AS cfg FROM app_config LIMIT 1`,
    );
    const raw = (r.rows[0]?.cfg ?? {}) as { signatories?: Record<string, unknown>; approvedVersions?: Record<string, unknown> };
    const signatories: PartnerSignatoryConfig["signatories"] = {};
    for (const j of ["PL", "MX"] as const) {
      const s = raw.signatories?.[j];
      if (isSignatory(s)) signatories[j] = s;
    }
    const approvedVersions: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.approvedVersions ?? {})) {
      if (typeof v === "string") approvedVersions[k] = v;
    }
    return { signatories, approvedVersions };
  } catch (err) {
    throw new DatabaseError("getPartnerSignatoryConfig", err);
  }
}

/**
 * Merges one key into metadata.partnerSignatories.<section> without touching
 * anything else in metadata. Creates the singleton app_config row if a
 * tenant somehow doesn't have one yet.
 */
async function mergeSignatorySection(
  client: PoolClient,
  section: "signatories" | "approvedVersions",
  key: string,
  value: unknown,
): Promise<void> {
  const patch = JSON.stringify({ [key]: value });
  const r = await client.query(
    `UPDATE app_config
        SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
              'partnerSignatories',
              coalesce(metadata->'partnerSignatories', '{}'::jsonb) || jsonb_build_object(
                $1::text,
                coalesce(metadata->'partnerSignatories'->$1::text, '{}'::jsonb) || $2::jsonb
              )
            ),
            updated_at = now()
      WHERE id = (SELECT id FROM app_config LIMIT 1)`,
    [section, patch],
  );
  if (r.rowCount === 0) {
    await client.query(`INSERT INTO app_config (metadata) VALUES ($1::jsonb)`, [
      JSON.stringify({ partnerSignatories: { [section]: { [key]: value } } }),
    ]);
  }
}

export async function setPartnerSignatory(
  client: PoolClient,
  jurisdiction: PartnerJurisdiction,
  signatory: PartnerSignatory,
): Promise<void> {
  try {
    await mergeSignatorySection(client, "signatories", jurisdiction, signatory);
  } catch (err) {
    throw new DatabaseError("setPartnerSignatory", err);
  }
}

export async function setApprovedPartnerVersion(
  client: PoolClient,
  templateKey: string,
  locale: string,
  versionId: string,
): Promise<void> {
  try {
    await mergeSignatorySection(client, "approvedVersions", approvalKey(templateKey, locale), versionId);
  } catch (err) {
    throw new DatabaseError("setApprovedPartnerVersion", err);
  }
}
