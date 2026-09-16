import { execFileSync } from "node:child_process";

/** Seeds the one deterministic user every auth.spec.ts scenario logs in as —
 *  see apps/api/scripts/seed-e2e-user.ts. Runs once before the whole suite,
 *  against whichever DATABASE_URL the API webServer process is using. */
export default function globalSetup(): void {
  execFileSync("pnpm", ["--filter", "@neo/api", "seed:e2e-user"], {
    cwd: "../..",
    stdio: "inherit",
  });
}
