---
name: health-report
description: Weekly (or on-demand) repo health report — security, UX/UI, test coverage, performance, dead code/unused tables, hoisting/centralization, architecture drift, i18n parity, dependency freshness. Produces one document handoff-ready for a follow-up Claude session to act on. Use when asking for a health report, weekly report, or "what needs attention across the repo".
argument-hint: "[full | <category>]"
---

# Health Report

> **Focus**: $ARGUMENTS — `full` runs every category below, a category name runs just that one. Empty defaults to `full`. This skill is read-only — it never edits application code, only writes the report itself to `docs/reports/`.

You compile a single, dated, handoff-ready health report by delegating each section to the specialist skill that already owns that domain, then writing the combined result to `docs/reports/health-[YYYY-MM-DD].md`. This is not a new analysis engine — it's a fixed checklist that runs existing tools and existing skills on a schedule so nobody has to remember to ask.

> **IMPORTANT**: All output — English only.

---

## Sections (run all for `full`)

| # | Category | How to compile it |
|---|---|---|
| 1 | Security | `/audit full` — the complete 9-category threat model |
| 2 | UX/UI | `/ux` review pass — accessibility, touch targets, consistency, states (loading/empty/error) across recently-changed views |
| 3 | Test coverage | `/qa coverage` — which files/routes have no test coverage, plus a scan for the "No Empty Tests" anti-pattern already defined in `/qa` |
| 4 | Performance | `/dba cleanup` (slow queries, missing indexes, N+1) + frontend bundle size: `pnpm --filter @neo/pwa build` output, flag any chunk over the Vite default warning threshold |
| 5 | Dead code / unused tables | `pnpm depcruise` orphan warnings + a table-usage sweep: for every table in CLAUDE.md's Database section, `grep -rl "\btable_name\b" apps/api/src` — flag zero-hit tables (cross-reference against the known-provisioned-ahead-of-build list already established, don't re-alarm on those) |
| 6 | Hoisting / centralization | `/dev refactor` using its own "Centralization & Hoisting" checklist — duplicate constants, cross-workspace package version drift, canonical type reuse |
| 7 | Architecture drift | `/arch drift` |
| 8 | i18n parity | `pnpm i18n:unused` + the parity check already defined in `/qa i18n` mode |
| 9 | Dependency freshness | `pnpm outdated` (all workspaces) + `pnpm audit --audit-level=high` |

Each section in the output must be **short and actionable** — a finding table (severity, location, fix), not prose. If a section has nothing to report, write "Clean" and move on; don't pad it.

---

## Output Format

Write to `docs/reports/health-[YYYY-MM-DD].md`:

```markdown
# Health Report — [YYYY-MM-DD]

## Summary
[3-5 bullets — the handful of things worth a human's attention this week, ranked by severity/effort]

## 1. Security
[table: severity | location | finding | fix]

## 2. UX/UI
...

## 3. Test Coverage
...

## 4. Performance
...

## 5. Dead Code / Unused Tables
...

## 6. Hoisting / Centralization
...

## 7. Architecture Drift
...

## 8. i18n Parity
...

## 9. Dependency Freshness
...

## Suggested Next Session
[1-3 sentences — if Łukasz hands this file to a fresh Claude session, what should it tackle first]
```

This file is designed to be pasted back into a new Claude conversation as a work list — write it assuming the reader has no other context.

---

## Delegation

| Trigger | Delegate to |
|---|---|
| A finding needs an actual code fix, not just reporting | `/dev` (in a follow-up session, not this one — this skill only reports) |
| A finding reveals a real architectural problem | `/arch` |
| Scheduling this to run weekly | the `schedule` skill/tool — this skill defines *what* to run, not *when* |
