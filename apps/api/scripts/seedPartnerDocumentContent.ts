/**
 * Seed — NEO-51 partner onboarding documents, version 1.
 *
 * Inserts the texts Łukasz approved on 2026-09-24 (the partner agreement,
 * its Annex 1 data processing agreement, and the privacy notice — each in
 * PL and MX) into platform.document_content_version, from the static files
 * in scripts/seed-content/. They are PL/ES legal text on purpose: seed data
 * representing PL/MX market content, which CLAUDE.md allows outside i18n.
 *
 * Idempotent: a template/locale that already has a current version is
 * skipped, so re-running never stacks a stale copy on top of edits made in
 * the Documents tab. Pass --force to add a new version anyway.
 *
 * Content goes through the same sanitizer the Documents editor uses
 * (sanitizeDocumentContentHtml) and the script aborts if sanitizing would
 * change it — seed files must only use the editor's allowed tags.
 *
 * Seeding does NOT approve anything: the NeoSleep signatory for each
 * jurisdiction still has to approve the version in the Documents tab before
 * it can be countersigned (see apps/api/src/db/partnerSignatories.ts).
 *
 * Run: cd apps/api && npx tsx --env-file=../../.env scripts/seedPartnerDocumentContent.ts [--force]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPlatform } from "../src/db/tenant.js";
import { getCurrentDocumentContentVersion, insertDocumentContentVersion } from "../src/db/documentContent.js";
import { sanitizeDocumentContentHtml } from "../src/commands/documentContent.js";

const SEED_USER_ID = "00000000-0000-0000-0000-000000000000";
const SEED_NAME = "System (seed)";
const SEED_EMAIL = "system@neosleepcare.com";
const SEED_TENANT_SLUG = "system";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, "seed-content");

const TEMPLATE_KEYS = ["partnerAgreement", "partnerDpa", "partnerPrivacyNotice"] as const;
const LOCALES = ["pl", "mx"] as const;

const force = process.argv.includes("--force");

function normalizeWhitespace(html: string): string {
  return html.replace(/>\s+</g, "><").trim();
}

for (const templateKey of TEMPLATE_KEYS) {
  for (const locale of LOCALES) {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, `${templateKey}.${locale}.html`), "utf-8");
    const sanitized = sanitizeDocumentContentHtml(raw);
    if (normalizeWhitespace(sanitized) !== normalizeWhitespace(raw)) {
      throw new Error(`${templateKey}.${locale}.html uses markup the Documents editor would strip — fix the seed file`);
    }

    const result = await withPlatform(async (client) => {
      const current = await getCurrentDocumentContentVersion(client, templateKey, locale);
      if (current && !force) return { skipped: true as const, version: current.version_number };
      const version = await insertDocumentContentVersion(client, {
        templateKey,
        locale,
        contentHtml: sanitized,
        createdByUserId: SEED_USER_ID,
        createdByName: SEED_NAME,
        createdByEmail: SEED_EMAIL,
        createdByTenantSlug: SEED_TENANT_SLUG,
        changeNote: "NEO-51: texts approved by Łukasz Ostrowski on 2026-09-24",
      });
      return { skipped: false as const, version: version.version_number };
    });

    console.log(
      result.skipped
        ? `skipped ${templateKey}/${locale} — current version ${result.version} already exists (use --force to add another)`
        : `seeded ${templateKey}/${locale} -> version ${result.version}`,
    );
  }
}

process.exit(0);
