/**
 * Placeholder extractor.
 * In v1 we will use a proper extractor (e.g. vue-i18n-extract) OR AST scan.
 * This script exists so CI has stable entrypoints.
 */
import fs from "node:fs";
import path from "node:path";

const enPath = path.resolve("packages/i18n/en.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));

// TODO: scan source code and find t('key') usages
// For now: no-op.
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + "\n");
console.log("i18n:extract (noop placeholder) done");
