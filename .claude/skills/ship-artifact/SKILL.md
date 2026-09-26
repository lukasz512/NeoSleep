---
name: ship-artifact
description: Builds, publishes and hands over the per-change Artifact (the one deliverable Łukasz reads after every session) from a fixed template — fills ticket/branch/PR/session links automatically, attaches it to the Linear ticket, comments there, moves the ticket to Needs Review and writes the quality-gate marker. Use at the end of any change, ticket or not, or when asked to show/refresh/redo the artifact for a branch.
argument-hint: "[content.json path]"
---

# Ship Artifact

> **Focus**: $ARGUMENTS — a content JSON to render; empty means write one first (Step 1).

Łukasz's standing rule (2026-09-25): after every session the Artifact is **the** deliverable — on the Linear ticket and in the chat. He needs nothing else. This skill makes it the same shape every time, so he learns where to look. Rules behind it: CLAUDE.md "Standing decisions"; `.claude/hooks/quality-gate.sh` enforces the marker.

**Before anything: a NEO ticket and a branch named after it (NEO-84).** No ticket → create one (`## Problem` / `## Change` / `## Done when`, ≤1500 chars — the PreToolUse hook rejects anything else) and rename the branch. `render` refuses a branch without `neo-<n>`.

## Step 1 — Write the content JSON (the only judgment part)

Save it to the session scratchpad (not the repo), for example `<scratchpad>/artifact-content.json`:

```json
{
  "title": "NEO-47 Patient Write Scope",
  "headline": "Editing or deleting a patient now respects the same territory limits as viewing one",
  "summary": "Two sentences, plain language, what changed for the user and why it matters.",
  "prTitle": "Territory-scope patient update and delete",
  "kind": "security fix",
  "area": "apps/api",
  "decisions": ["Only what truly needs Łukasz. Omit the key when nothing does."],
  "beforeAfter": {
    "caption": "Example: a rep who only covers <b>MX</b> acts on a patient in <b>PL</b>.",
    "columns": ["Action", "Before", "After"],
    "rows": [
      ["Edit patient (<code>PATCH /patient/:id</code>)", {"status": "hole", "text": "200 · allowed"}, {"status": "deny", "text": "403"}],
      ["Edit own-territory patient", {"status": "allow", "text": "200"}, {"status": "allow", "text": "200", "note": "unchanged"}]
    ]
  },
  "images": [{"label": "Before", "src": "docs/worker-screenshots/NEO-9/before.png"}, {"label": "After", "src": "docs/worker-screenshots/NEO-9/after.png"}],
  "code": "short diff excerpt, optional",
  "notes": ["Scope notes, behavior changes, what was deliberately left out."],
  "runLocally": ["pnpm --filter @neo/email --filter @neo/documents build", "cd apps/api && pnpm test src/commands/patient.spec.ts"],
  "runNote": "How to see it in the running app.",
  "verify": ["One line per acceptance criterion — mirrors the ticket 1:1."],
  "verifyNote": "Where the evidence is (e.g. 'the deny tests fail on the old code').",
  "hoisting": "platform",
  "testCoverageMap": [{"ac": "…", "tests": ["file › test name"]}],
  "visualComparison": "Only when UI changed: what before/after evidence exists."
}
```

Rules for the content:
- **Hard limits, enforced by `render`** (it fails, listing what's too long): headline ≤ 110 chars, summary ≤ 2 sentences and ≤ 320 chars, prTitle ≤ 80, decisions ≤ 4 × 220 chars, notes ≤ 4 × 220, verify ≤ 8 × 160. Cut words, never split one thought over more items to fit.
- **summary** — what changed for the user and why it matters, written for Łukasz (smart non-specialist), no file lists, no process narration.
- **decisions**: open questions, risks, skipped steps. Never pad it; omit the key when empty.
- **Before/after is mandatory.** Backend-only → `beforeAfter` behavior table (request → status per role/territory; `hole` = the bug, `deny`/`allow` = correct). UI (`.vue/.css/.scss` changed) → real screenshots in `images` (the script refuses to render without them), or `mockupHtml` clearly labeled as a mockup when no live render is possible. Real PWA screenshots without a DB: see memory `feedback-always-worktree-always-artifact` (vite + Playwright with `/api/v1/` stubbed).
- **verify** mirrors the acceptance criteria 1:1.
- Everything else (ticket, branch, changed files, Create PR URL, the links — Linear, VS Code session (and the Artifact URL in the Linear comment) — `claude --resume`, git checkout line) is filled in by the script — don't write it.

## Step 2 — Render

```bash
node .claude/skills/ship-artifact/build.mjs render <scratchpad>/artifact-content.json
```

Prints the page path and a ready Linear comment (summary + the 3 links + PR). The page itself has no Artifact button (it would link to itself, NEO-91); the Artifact URL goes into the Linear comment and the index. The page opens with the neoCRM brand band (NeoSleep palette + mark until neoCRM has its own kit). Render **after** `git push` so the Create PR button is live; before the push it shows a dashed "PR link after push" placeholder (fine for a mid-session preview, not for handover).

## Step 3 — Publish

`Artifact` tool with the printed page path (`icon` on first publish only, one-sentence `description`). Re-render + republish the same path to update — same URL.

## Step 4 — Linear (ticket branches only)

1. `save_issue` → `links: [{url: <artifact url>, title: "Artifact: <title>"}]` (attachment; append-only, safe to repeat).
2. `save_comment` → the comment text Step 2 printed, with `<ARTIFACT_URL>` replaced. On a refresh, update the earlier comment (`id`) instead of adding a new one.
3. Once pushed: `save_issue` → `state: "Needs Review"`. **Never** Done/closed — closing is Łukasz's call ([[feedback-dont-ship-open-questions-as-done]]). If the ticket still has an unresolved item from the original ask, leave the status and put it in `decisions`.

## Step 5 — Marker

```bash
node .claude/skills/ship-artifact/build.mjs finalize --url <artifact url> --linear-attached --linear-commented --linear-status "Needs Review"
```

Only pass the flags for what you actually did.

## Step 5b — Change index (NEO-84)

`finalize` upserts this ticket's line in `.claude/local/artifact-index.json` (shared by all worktrees). Then:

```bash
node .claude/skills/ship-artifact/build.mjs index
```

It prints the page path and the index URL (from `.claude/local/artifact-index-url.txt`). Read that URL with the `Artifact` tool (`action: "read"`) first if this conversation hasn't, then publish the page with `url` set to it — same URL forever. No URL yet → publish it as a new Artifact (icon `list`). Finally:

```bash
node .claude/skills/ship-artifact/build.mjs index --published <index url>
```

That marks the marker `indexed`, which the quality gate checks. Re-run the three commands whenever the ticket's status changes (e.g. after moving it to Needs Review) so the index shows it.

## Step 6 — Reply

Final message: outcome in ≤ 2 sentences + the Artifact link + anything from `decisions`. Nothing else — the rest lives in the Artifact.
