/**
 * Remove unused i18n keys from locale files. Run i18n:unused first to generate i18n/_unused.json.
 * Logs every key that would be / was removed. By default runs in dry-run (no files modified).
 * Use --apply to actually remove keys. Writes i18n/_prune-log.txt for audit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const i18nDir = path.join(rootDir, "packages/i18n");
const unusedPath = path.join(i18nDir, "_unused.json");
const logPath = path.join(i18nDir, "_prune-log.txt");

const apply = process.argv.includes("--apply");

const logLines = [];
function log(msg) {
  console.log(msg);
  logLines.push(msg);
}

if (!fs.existsSync(unusedPath)) {
  log("i18n:prune — No i18n/_unused.json found. Run 'pnpm i18n:unused' first.");
  fs.writeFileSync(logPath, logLines.join("\n") + "\n", "utf-8");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(unusedPath, "utf-8"));
const unused = report.unused || [];

if (unused.length === 0) {
  log("i18n:prune — No unused keys to remove. _unused.json reports 0 unused keys.");
  log("Log written to " + logPath);
  fs.writeFileSync(logPath, logLines.join("\n") + "\n", "utf-8");
  process.exit(0);
}

log("i18n:prune — " + (apply ? "Removing" : "Would remove") + " " + unused.length + " keys from locale files.");
log("Unused list from: " + (report.scannedAt || "unknown"));
log("Mode: " + (apply ? "APPLY (files will be modified)" : "DRY RUN (no files modified)"));
log("");

const localeFiles = fs.readdirSync(i18nDir, "utf-8").filter((f) => f.endsWith(".json") && !f.startsWith("_"));

const unusedSet = new Set(unused);
let totalRemoved = 0;
const removedByFile = {};

for (const file of localeFiles) {
  const filePath = path.join(i18nDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (Array.isArray(data)) continue;
  const keys = Object.keys(data);
  const toRemove = keys.filter((k) => unusedSet.has(k));
  if (toRemove.length === 0) continue;
  removedByFile[file] = toRemove;
  for (const key of toRemove) {
    log((apply ? "Removed" : "Would remove") + " '" + key + "' from " + file);
    totalRemoved++;
    if (apply) delete data[key];
  }
  if (apply && toRemove.length > 0) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  }
}

log("");
log("Summary: " + (apply ? "Removed" : "Would remove") + " " + totalRemoved + " key(s) across " + Object.keys(removedByFile).length + " file(s).");
for (const [f, keys] of Object.entries(removedByFile)) {
  log("  " + f + ": " + keys.length + " keys");
}
if (!apply && totalRemoved > 0) {
  log("");
  log("To apply changes, run: pnpm i18n:prune --apply");
}
log("");
log("Log file: " + logPath);
fs.writeFileSync(logPath, logLines.join("\n") + "\n", "utf-8");
