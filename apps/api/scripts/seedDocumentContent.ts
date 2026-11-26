/**
 * One-off seed — Document Content Editor (docs/stories/document-content-editor.md,
 * plan Step 2). Moves the current editable-blob prose for the three real
 * documents out of packages/i18n/{en,pl,mx}.json and into
 * platform.document_content_version as version_number=1, is_current=true
 * rows, BEFORE the template files were switched to expect a {{content}}
 * slot with nothing behind it.
 *
 * Pulls text via documentT(locale, key) with no params — deliberately NOT
 * interpolating {legalEntityName}/{company}: those must survive as literal
 * tokens in the stored content_html so fillContentParams keeps resolving
 * them per-locale at render time (see documentRender.ts), not get baked in
 * once here.
 *
 * Intended to be run exactly once per environment. Re-running is harmless
 * (insertDocumentContentVersion just creates version 2/3/... on top), but
 * pointless — this script only ever writes today's static-i18n snapshot.
 *
 * Run: cd apps/api && npx tsx --env-file=../../.env scripts/seedDocumentContent.ts
 */
import { documentT } from "@neo/documents";
import { withPlatform } from "../src/db/tenant.js";
import { insertDocumentContentVersion } from "../src/db/documentContent.js";

const SEED_USER_ID = "00000000-0000-0000-0000-000000000000";
const SEED_NAME = "System (seed migration)";
const SEED_EMAIL = "system@neosleepcare.com";
const SEED_TENANT_SLUG = "system";

function p(text: string): string {
  return `<p>${text}</p>`;
}

function informedConsentContent(locale: string): string {
  const t = (key: string): string => documentT(locale, `documents.informedConsent.${key}`);
  return [
    p(t("intro")),
    p(t("p1")),
    p(t("p2")),
    p(`<strong>${t("altTreatmentsIntro")}</strong>`),
    `<ul><li>${t("altTreatment1")}</li><li>${t("altTreatment2")}</li><li>${t("altTreatment3")}</li><li>${t("altTreatment4")}</li></ul>`,
    p(t("p3")),
    p(t("p4")),
    p(t("p5")),
    p(t("p6")),
    p(t("p7")),
    p(t("p8")),
    p(t("p9")),
    p(t("p10")),
    p(t("p11")),
    p(t("p12")),
    p(`<strong>${t("declareLabel")}</strong> ${t("declareBody")}`),
    p(t("declareBody2")),
    p(`<strong>${t("authorizeLabel")}</strong> ${t("authorizeBody")}`),
    p(t("authorizeBody2")),
    p(t("authorizeBody3")),
    p(t("revokeNotice")),
  ].join("\n");
}

function gdprConsentContent(templateKey: "gdprConsentPl" | "gdprConsentMx", locale: string): string {
  const t = (key: string): string => documentT(locale, `documents.${templateKey}.${key}`);
  return [p(t("p1")), p(t("p2")), p(t("p3")), p(t("p4")), p(t("p5"))].join("\n");
}

interface SeedEntry {
  templateKey: string;
  locale: string;
  contentHtml: string;
}

const entries: SeedEntry[] = [
  { templateKey: "informedConsent", locale: "en", contentHtml: informedConsentContent("en") },
  { templateKey: "informedConsent", locale: "pl", contentHtml: informedConsentContent("pl") },
  { templateKey: "informedConsent", locale: "mx", contentHtml: informedConsentContent("mx") },
  { templateKey: "gdprConsent.pl", locale: "pl", contentHtml: gdprConsentContent("gdprConsentPl", "pl") },
  { templateKey: "gdprConsent.mx", locale: "mx", contentHtml: gdprConsentContent("gdprConsentMx", "mx") },
];

for (const entry of entries) {
  const version = await withPlatform((client) =>
    insertDocumentContentVersion(client, {
      templateKey: entry.templateKey,
      locale: entry.locale,
      contentHtml: entry.contentHtml,
      createdByUserId: SEED_USER_ID,
      createdByName: SEED_NAME,
      createdByEmail: SEED_EMAIL,
      createdByTenantSlug: SEED_TENANT_SLUG,
      changeNote: "Initial seed from static i18n content (document-content-editor rollout)",
    })
  );
  console.log(`seeded ${entry.templateKey}/${entry.locale} -> version ${version.version_number} (id ${version.id})`);
}

process.exit(0);
