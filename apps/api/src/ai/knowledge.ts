import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Knowledge for NeoSleep AI (CORE-274): a curated text bundle, built at build time from
 * the user guide and the clinical protocol. The AI never reads the repo at runtime and
 * never gets a GitHub token. Adding a source here is a conscious, reviewed act.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Compiled location of the bundle written by `buildKnowledge` CLI (dist/ai/knowledge.md). */
const BUNDLE_PATH = path.join(HERE, "knowledge.md");
/** Repo root, both from src/ai and from dist/ai (apps/api/{src,dist}/ai → 4 levels up). */
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");

/** Hard cap so a runaway source cannot blow the prompt (and the bill). */
export const MAX_KNOWLEDGE_CHARS = 120_000;

interface Source {
  title: string;
  file: string;
  kind: "json" | "markdown";
}

/** Curated allowlist. Partner-internal and personal-data documents are deliberately absent. */
const SOURCES: Source[] = [
  { title: "User guide", file: "docs/user-guide/content/en.json", kind: "json" },
  { title: "Clinical care protocol", file: "docs/clinical/protocolo-atencion/README.md", kind: "markdown" },
];

/** Flattens guide JSON into readable lines; keeps text, drops keys that are only ids. */
export function flattenJson(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    const text = value.trim();
    if (text) out.push(text);
  } else if (Array.isArray(value)) {
    for (const item of value) flattenJson(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) flattenJson(item, out);
  }
  return out;
}

export function buildKnowledge(root: string = REPO_ROOT): string {
  const parts: string[] = [];
  for (const source of SOURCES) {
    const full = path.join(root, source.file);
    if (!existsSync(full)) throw new Error(`AI knowledge source missing: ${source.file}`);
    const raw = readFileSync(full, "utf8");
    const body = source.kind === "json" ? flattenJson(JSON.parse(raw) as unknown).join("\n") : raw.trim();
    parts.push(`# ${source.title}\n\n${body}`);
  }
  const text = parts.join("\n\n");
  if (text.length > MAX_KNOWLEDGE_CHARS) {
    throw new Error(`AI knowledge bundle is ${text.length} chars, over the ${MAX_KNOWLEDGE_CHARS} cap`);
  }
  return text;
}

let cached: string | undefined;

/** The prebuilt bundle in a deployed image, else built from the docs (dev, tests). */
export function loadKnowledge(): string {
  if (cached === undefined) {
    cached = existsSync(BUNDLE_PATH) ? readFileSync(BUNDLE_PATH, "utf8") : buildKnowledge();
  }
  return cached;
}
