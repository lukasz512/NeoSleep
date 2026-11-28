import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildKnowledge } from "./knowledge.js";

/** Build step (`pnpm build`): writes dist/ai/knowledge.md so the runtime image needs no docs/. */
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "knowledge.md");
mkdirSync(path.dirname(out), { recursive: true });
const text = buildKnowledge();
writeFileSync(out, text);
console.log(`AI knowledge bundle written: ${text.length} chars`);
