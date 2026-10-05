import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** `--name value` from argv, or the fallback. */
export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * pnpm keeps playwright only under node_modules/.pnpm (no top-level link),
 * so resolve the installed version from there.
 */
export async function loadPlaywright() {
  const store = path.join(REPO, "node_modules/.pnpm");
  const dir = fs.readdirSync(store).filter((d) => /^playwright@\d/.test(d)).sort().pop();
  if (!dir) throw new Error("playwright is not installed — run pnpm install");
  return import(path.join(store, dir, "node_modules/playwright/index.mjs"));
}

/** "{name}" placeholders → values. */
export function fill(text, values) {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? `{${k}}`));
}
