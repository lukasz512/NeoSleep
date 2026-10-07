#!/usr/bin/env node
// Imports Linear's history into the platform work board, slimmed (CORE-177, decision K3).
//
//   node infrastructure/scripts/work-board-import.mjs                 # dry run: counts only
//   node infrastructure/scripts/work-board-import.mjs --fetch         # refresh the export from Linear first
//   DATABASE_URL=... node infrastructure/scripts/work-board-import.mjs --apply
//   node infrastructure/scripts/work-board-import.mjs --sql apps/api/migrations/0NN_x.sql  # reviewed migration
//
// The shared Supabase DB holds production data: land the history there with --sql (a PR),
// keep --apply for a local or test database.
//
// --fetch reads LINEAR_API_KEY (or .claude/local/linear-api-key.txt) and rewrites
// .claude/local/linear-export/export.json; the raw export never leaves the machine.
// --apply is idempotent: an issue already imported (same linear_identifier) or a KEY-n
// already on the board is skipped. Each team's counter then continues after the highest
// number, so new items never reuse a Linear key.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { slimIssue } from "./linear-slim.mjs";
import { buildImportSql } from "./work-board-sql.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const mainCheckout = repo.includes("/.claude/worktrees/") ? repo.slice(0, repo.indexOf("/.claude/worktrees/")) : repo;
const exportPath = join(mainCheckout, ".claude/local/linear-export/export.json");
const args = new Set(process.argv.slice(2));

const ISSUE_FIELDS = `
  identifier title description priorityLabel createdAt updatedAt completedAt canceledAt
  state { name type } team { key name }
  labels { nodes { name } }
  attachments { nodes { title url } }
  comments(first: 100) { nodes { body createdAt } }`;

async function fetchExport() {
  const keyFile = join(mainCheckout, ".claude/local/linear-api-key.txt");
  const key = process.env.LINEAR_API_KEY ?? (existsSync(keyFile) ? readFileSync(keyFile, "utf8").trim() : "");
  if (!key) throw new Error("LINEAR_API_KEY missing (env or .claude/local/linear-api-key.txt)");
  const issues = [];
  let after = null;
  do {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: key },
      body: JSON.stringify({
        query: `query($after: String) { issues(first: 50, after: $after, includeArchived: true) {
          pageInfo { hasNextPage endCursor } nodes { ${ISSUE_FIELDS} } } }`,
        variables: { after },
      }),
    });
    const body = await res.json();
    if (!res.ok || body.errors) throw new Error(`Linear: ${JSON.stringify(body.errors ?? res.status)}`);
    issues.push(...body.data.issues.nodes);
    after = body.data.issues.pageInfo.hasNextPage ? body.data.issues.pageInfo.endCursor : null;
  } while (after);
  mkdirSync(dirname(exportPath), { recursive: true });
  writeFileSync(exportPath, JSON.stringify({ exportedAt: new Date().toISOString(), issues }, null, 1));
  console.log(`[import] fetched ${issues.length} issues from Linear → ${exportPath}`);
}

function loadExport() {
  return JSON.parse(readFileSync(exportPath, "utf8"));
}

function summarize(slim) {
  const byTeam = {};
  let comments = 0;
  for (const { item, comments: c } of slim) {
    byTeam[item.team_key] = (byTeam[item.team_key] ?? 0) + 1;
    comments += c.length;
  }
  console.log(`[import] ${slim.length} items ${JSON.stringify(byTeam)}, ${comments} comments kept`);
}

async function apply(slim) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
  const require = createRequire(join(repo, "apps/api/package.json"));
  const { Client } = require("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let inserted = 0;
  let skipped = 0;
  try {
    await client.query("BEGIN");
    const teams = new Set((await client.query("SELECT key FROM platform.work_team")).rows.map((r) => r.key));
    for (const { item, comments } of slim) {
      if (!teams.has(item.team_key)) {
        await client.query(`INSERT INTO platform.work_team (key, name, kind) VALUES ($1, $1, 'client')`, [item.team_key]);
        teams.add(item.team_key);
      }
      const row = await client.query(
        `INSERT INTO platform.work_item
           (team_key, number, title, problem, change, done_when, status, priority, labels, links, branch,
            source, linear_identifier, created_by, created_at, updated_at, status_changed_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, 'linear_import', $12, 'linear',
                 $13::timestamptz, COALESCE($14::timestamptz, $13::timestamptz),
                 COALESCE($14::timestamptz, $13::timestamptz), $14::timestamptz)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          item.team_key, item.number, item.title, item.problem, item.change, item.done_when, item.status,
          item.priority, item.labels, JSON.stringify(item.links), item.branch, item.linear_identifier,
          item.created_at, item.completed_at,
        ],
      );
      const id = row.rows[0]?.id;
      if (!id) {
        skipped++;
        continue;
      }
      inserted++;
      await client.query(
        `INSERT INTO platform.work_item_event (item_id, kind, to_status, body, actor, actor_kind, created_at)
         VALUES ($1, 'created', $2, $3, 'linear', 'import', $4)`,
        [id, item.status, `Imported from Linear ${item.linear_identifier}`, item.created_at],
      );
      for (const c of comments) {
        await client.query(
          `INSERT INTO platform.work_item_event (item_id, kind, body, actor, actor_kind, created_at)
           VALUES ($1, 'comment', $2, 'linear', 'import', $3)`,
          [id, c.body, c.created_at],
        );
      }
    }
    await client.query(
      `UPDATE platform.work_team t SET next_number = GREATEST(t.next_number, m.max_number + 1)
         FROM (SELECT team_key, max(number) AS max_number FROM platform.work_item GROUP BY team_key) m
        WHERE m.team_key = t.key`,
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
  console.log(`[import] inserted ${inserted}, skipped ${skipped} already on the board`);
}

try {
  if (args.has("--fetch")) await fetchExport();
  const { exportedAt, issues } = loadExport();
  const slim = issues.map(slimIssue).filter(Boolean);
  summarize(slim);
  const argv = process.argv.slice(2);
  const sqlOut = argv.includes("--sql") ? argv[argv.indexOf("--sql") + 1] : null;
  if (sqlOut) {
    writeFileSync(resolve(sqlOut), buildImportSql(slim, { exportedAt }));
    console.log(`[import] wrote ${sqlOut}`);
  } else if (args.has("--apply")) await apply(slim);
  else console.log("[import] dry run — pass --apply or --sql <file> to write");
} catch (err) {
  console.error(`[import] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
