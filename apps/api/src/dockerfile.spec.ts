import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * The Cloud Run image must run the Node major the repo is built and tested on
 * (.nvmrc / engines). It drifted once: the image shipped node:20 while
 * everything else ran 22, and supabase-js (Storage) refuses to start on Node
 * < 22 ("native WebSocket not found") — so every partner-document preview on
 * pwa-dev failed as an opaque "Database error: withTenant" (2026-09-25).
 * Pure file check, no DB.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

describe("apps/api/Dockerfile", () => {
  it("uses the same Node major as .nvmrc in every stage", () => {
    const nvmrc = readFileSync(path.join(repoRoot, ".nvmrc"), "utf-8").trim().replace(/^v/, "");
    const major = nvmrc.split(".")[0];
    const dockerfile = readFileSync(path.join(repoRoot, "apps/api/Dockerfile"), "utf-8");
    const froms = [...dockerfile.matchAll(/^FROM\s+node:(\d+)[^\s]*/gm)].map((m) => m[1]);
    expect(froms.length).toBeGreaterThan(0);
    expect(froms).toEqual(froms.map(() => major));
  });
});
