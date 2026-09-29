/**
 * Creates (or rotates the password of) the QA account used by the post-merge
 * pwa-dev check (infrastructure/scripts/smoke-dev-ui.mjs). Run against the
 * database behind pwa-dev:
 *
 *   pnpm --filter @neo/api seed:qa-user -- --out ../../.claude/local/qa-dev.json
 *
 * The password is generated here, stored in the DB only as a bcrypt hash, and
 * written once to the --out file (gitignored .claude/local/) — it never goes
 * into Render, GitHub or the repo. Running it again rotates the password
 * (insertStaffUser upserts on email) and rewrites the file.
 *
 * Role is admin so the smoke run can open every list and detail view; the
 * smoke script only reads, it never creates, edits or deletes.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser } from "../src/db.js";

export const QA_USER_EMAIL = "qa-smoke@neosleepcare.com";

function outPath(): string {
  const i = process.argv.indexOf("--out");
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error("Pass --out <file> (e.g. ../../.claude/local/qa-dev.json) — the password is shown nowhere else.");
  }
  return path.resolve(process.argv[i + 1]);
}

async function seed(): Promise<void> {
  const out = outPath();
  const slug = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";
  const password = crypto.randomBytes(18).toString("base64url");
  const hash = await bcrypt.hash(password, 12);
  await withTenant(slug, (client) =>
    insertStaffUser(client, QA_USER_EMAIL, "QA", "Smoke", "admin", hash, false),
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ url: "https://pwa-dev.neosleepcare.com", email: QA_USER_EMAIL, password, tenant: slug }, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(`[seed-qa-user] ready: ${QA_USER_EMAIL} (tenant ${slug}); credentials written to ${out}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-qa-user] failed:", err);
    process.exit(1);
  });
