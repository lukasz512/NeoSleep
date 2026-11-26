/**
 * Detect i18n keys that exist in en.json but are not referenced in source (static scan).
 * Writes i18n/_unused.json with the list. Dynamic keys (e.g. user.${name}.title) are not
 * detected; they may appear as "unused" and should be reviewed before pruning.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const i18nDir = path.join(rootDir, "packages/i18n");
const enPath = path.join(i18nDir, "en.json");

const KEY_RE = /(?:^|[^.\w])t\s*\(\s*["']([^"']+)["']\s*\)/g;
const KEY_RE_ALT = /(?:^\s*|\W)\$t\s*\(\s*["']([^"']+)["']\s*\)/g;
const KEY_RE_I18N = /(?:^\s*|\W)i18n\.t\s*\(\s*["']([^"']+)["']\s*\)/g;

function* walk(dir, ext = /\.(vue|ts|js|mjs|cjs)$/) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      yield* walk(full, ext);
    } else if (ext.test(e.name)) {
      yield full;
    }
  }
}

function extractKeys(content) {
  const keys = new Set();
  for (const re of [KEY_RE, KEY_RE_ALT, KEY_RE_I18N]) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) {
      keys.add(m[1]);
    }
  }
  return keys;
}

const used = new Set();
const searchDirs = [
  path.join(rootDir, "apps"),
  path.join(rootDir, "packages"),
].filter((d) => fs.existsSync(d));

let fileCount = 0;
for (const dir of searchDirs) {
  for (const file of walk(dir)) {
    fileCount++;
    const content = fs.readFileSync(file, "utf-8");
    for (const key of extractKeys(content)) {
      used.add(key);
    }
  }
}

const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));
const allKeys = Array.isArray(en) ? [] : Object.keys(en);
const unused = allKeys.filter((k) => !used.has(k)).sort();

const report = {
  unused,
  scannedAt: new Date().toISOString(),
  sourceFilesScanned: fileCount,
  usedKeysCount: used.size,
  totalKeysInEn: allKeys.length,
  unusedCount: unused.length,
};

const outPath = path.join(i18nDir, "_unused.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf-8");

console.log("i18n:unused — Scanned", fileCount, "files. Used", used.size, "keys; en.json has", allKeys.length, "keys.");
console.log("Unused keys (static scan; dynamic keys may be false positives):", unused.length);
if (unused.length > 0) {
  console.log(unused.slice(0, 30).join(", "), unused.length > 30 ? `… and ${unused.length - 30} more` : "");
}
console.log("Report written to", outPath);
