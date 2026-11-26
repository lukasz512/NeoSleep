/**
 * Read-only OrthoApnea GET for hand-run research (NEO-210) — refuses anything
 * but a path under /api/ and only ever issues GET, so it can never place or
 * change an order. Prints status + JSON body.
 *
 *   pnpm --filter @neo/api exec tsx --env-file=../../.env scripts/oa-read.ts /api/treatments/byPatient/44171?page=0&size=20
 */
import { orthoApneaRawRequest } from "../src/services/partners/orthoapnea.js";

const path = process.argv[2] ?? "";
if (!path.startsWith("/api/")) throw new Error("usage: oa-read.ts /api/<path> (GET only)");
const res = await orthoApneaRawRequest(path, { method: "GET" });
const text = await res.text();
console.log(res.status);
console.log(text);
