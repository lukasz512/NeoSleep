/**
 * Check that packages/i18n/en.json, pl.json and mx.json declare the exact
 * same set of keys. en.json is the source of truth (CLAUDE.md: add keys
 * there first) — pl.json/mx.json missing a key, or declaring one en.json
 * doesn't have, both fail the check. Exits non-zero on any mismatch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const i18nDir = path.join(rootDir, "packages/i18n");

const LOCALES = ["en", "pl", "mx"];
const SOURCE_LOCALE = "en";

function loadKeys(locale) {
  const filePath = path.join(i18nDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return new Set(Array.isArray(data) ? [] : Object.keys(data));
}

const keysByLocale = Object.fromEntries(LOCALES.map((locale) => [locale, loadKeys(locale)]));
const sourceKeys = keysByLocale[SOURCE_LOCALE];

let hasMismatch = false;
for (const locale of LOCALES) {
  if (locale === SOURCE_LOCALE) continue;
  const keys = keysByLocale[locale];
  const missing = [...sourceKeys].filter((k) => !keys.has(k)).sort();
  const extra = [...keys].filter((k) => !sourceKeys.has(k)).sort();

  if (missing.length > 0) {
    hasMismatch = true;
    console.error(`i18n:parity — ${locale}.json is missing ${missing.length} key(s) present in en.json:`);
    console.error(missing.join(", "));
  }
  if (extra.length > 0) {
    hasMismatch = true;
    console.error(`i18n:parity — ${locale}.json has ${extra.length} extra key(s) not in en.json:`);
    console.error(extra.join(", "));
  }
}

if (hasMismatch) {
  console.error("i18n:parity — FAILED. Add missing keys to en.json first (CLAUDE.md), then translate in pl.json/mx.json.");
  process.exit(1);
}

console.log(`i18n:parity — OK. ${sourceKeys.size} keys in parity across ${LOCALES.join(", ")}.json.`);
