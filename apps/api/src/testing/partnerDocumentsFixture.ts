import type { PoolClient } from "pg";
import { ensureDocumentContent } from "./documentContentFixture.js";
import { setApprovedPartnerVersion, setPartnerSignatory } from "../db/partnerSignatories.js";

/**
 * Test support (NEO-51) — makes the partner onboarding documents
 * "ready" in the current tenant so ActivatePractitionerCommand and invite
 * acceptance can run: a current content version for each template/locale
 * (created only if none exists — never stacks on real content), a
 * signatory per jurisdiction with `approverUserId`, and both countersigned
 * templates approved.
 *
 * The signature PNG itself is never read from storage in tests — specs mock
 * services/partnerDocuments.js's downloadPartnerDocument.
 */
export const QA_SIGNATURE_PATH = "qa/signatures/fake.png";
export const QA_CC_EMAIL = "qa-partner-docs-cc@neosleepcare.com";

const TEMPLATES = ["partnerAgreement", "partnerDpa", "partnerPrivacyNotice"] as const;
const LOCALES = ["pl", "mx"] as const;

export async function ensurePartnerDocumentsReady(client: PoolClient, approverUserId: string): Promise<void> {
  for (const locale of LOCALES) {
    for (const templateKey of TEMPLATES) {
      const version = await ensureDocumentContent(templateKey, locale, {
        contentHtml: `<p>QA fixture ${templateKey} ${locale}</p>`,
        changeNote: "partnerDocumentsFixture",
        createdByUserId: approverUserId,
      });
      if (templateKey !== "partnerPrivacyNotice") {
        await setApprovedPartnerVersion(client, templateKey, locale, version.id);
      }
    }
  }
  for (const jurisdiction of ["PL", "MX"] as const) {
    await setPartnerSignatory(client, jurisdiction, {
      printedName: jurisdiction === "PL" ? "QA Signatory PL / NeoSleep" : "QA Signatory MX / NeoSleep",
      signaturePath: QA_SIGNATURE_PATH,
      approverUserId,
      ccEmail: QA_CC_EMAIL,
    });
  }
}
