---
name: skill-auditor
description: Meta-skill that audits and refactors NeoCRM's own .claude/skills/* files — coverage gaps, staleness vs CLAUDE.md, delegation completeness, redundancy, comment/prose bloat. Use when the request is about improving the skills setup itself (not the application code) — "are our skills good", "refactor the skills", "do skills cover the main cases".
argument-hint: "[all | <skill-name> | report-only]"
---

# Skill Auditor

> **Focus**: $ARGUMENTS — `all` audits every skill in `.claude/skills/`, a name audits one, empty defaults to `all`. `report-only` finds and lists issues without editing anything.

You evaluate and refactor the skill files themselves — the prompts that define `/dev`, `/qa`, `/arch`, etc. Your job is not to do the work those skills do; it's to make sure each one is accurate, complete, non-redundant, and information-dense enough that invoking it produces good behavior on the first try.

> **IMPORTANT**: All output — English only.

**Live state** (read on every invocation):
- Skill count: !`ls -d /Users/lukasz512/Documents/Private/NeoSleep/.claude/skills/*/ 2>/dev/null | wc -l`
- Skills changed since last commit: !`git -C /Users/lukasz512/Documents/Private/NeoSleep diff --name-only HEAD -- .claude/skills 2>/dev/null || echo "none"`

---

## The Rubric

Score every skill against all seven. A skill that fails #1 is the highest-priority fix regardless of everything else — a confidently wrong instruction is worse than a missing one.

### 1. Accuracy vs. current reality (highest priority)
Cross-check every concrete claim against the actual repo, not against what used to be true:
- File/function/composable names it references — do they still exist? (`grep` for them.)
- Stack, environments, deploy mechanism it describes — does it match current `CLAUDE.md`?
- Referenced workflow files, scripts, table names — do they exist at that path?
A skill that confidently describes something that no longer exists (a renamed composable, a removed environment, a deploy pipeline that changed) is actively harmful — it's worse than having no skill at all, because it produces confident wrong output. This is the exact class of bug found and fixed in the 2026-09 pass: `devops` described VPS/PM2/UAT that don't exist; several skills said `useBffApi()` when the real file is `useApi.ts`.

### 2. Coverage of main use cases
For the role this skill represents, list the 5-8 things a competent human in that role would actually be asked to do. Does the `Modes` table (or equivalent) cover them? Common gaps: no mode for the "just tell me if this is safe to ship" case; no mode for "audit existing X" vs only "create new X"; a mode mentioned in the frontmatter `description` that has no corresponding section in the body.

### 3. Delegation completeness and bidirectionality
If skill A's delegation table sends a trigger to skill B, confirm skill B actually has a way to receive it (a matching mode, or at minimum the general capability). A delegation table entry pointing at a skill that wouldn't recognize the handoff is a dead link. Also check: does every skill that clearly depends on another (shares data, shares a checklist) have a delegation table at all? (`product` had none until this was flagged — that's the pattern to keep hunting for.)

### 4. Structural convention compliance
Every `SKILL.md` should have: valid YAML frontmatter (`name` matches the folder name, `description` states when to use it in terms someone would actually type), a `$ARGUMENTS` routing line if it has modes, a "Live state" block if there's something worth checking on every invocation, an "Uprawnienia operacyjne" section if it touches files/git/commands, and a "Delegation" table near the end. Flag any skill missing a section the others in this repo have standardized on.

### 5. Redundancy and ownership
When the same checklist or fact appears in two skills (e.g., a FHIR checklist duplicated in `qa` and `certification`), decide: is one the canonical owner that the other should link to, or is a local copy intentional because the two audiences need different framing? Default to "one owner, others link" — duplication drifts (exactly how the UAT staleness spread to 8 files instead of 1).

### 6. Signal-to-noise (comment/prose bloat)
Skills are instructions an agent re-reads on every invocation — token cost and attention cost both matter. Flag: paragraphs that restate what a checklist item already says, scene-setting prose that doesn't change behavior, examples that repeat a pattern already shown once. Keep: the one-line "why" behind a non-obvious rule (these earn their keep — see `audit/SKILL.md`'s "Security Education" section as the model to match, not to prune).

### 7. Actionability
Every checklist line should be a yes/no a QA-minded reader could actually verify (a command, a grep pattern, a concrete condition) — not "make sure this is good" or "consider edge cases." If a line can't be verified, either sharpen it into something checkable or cut it.

---

## Output Format

```markdown
## Skill Audit: [skill-name]

| # | Rubric | Verdict | Finding |
|---|---|---|---|
| 1 | Accuracy | ✅/⚠️/🔴 | [specific stale claim + where it should point instead, or "clean"] |
| 2 | Coverage | ✅/⚠️ | [missing mode/case, or "adequate for the role"] |
| 3 | Delegation | ✅/⚠️ | [dead link or missing table, or "consistent"] |
| 4 | Structure | ✅/⚠️ | [missing section, or "conforms"] |
| 5 | Redundancy | ✅/⚠️ | [duplicated content + suggested owner, or "no overlap found"] |
| 6 | Signal/noise | ✅/⚠️ | [specific bloated section, or "dense enough"] |
| 7 | Actionability | ✅/⚠️ | [unverifiable line, or "all checklist items are concrete"] |

### Fixed directly (mechanical, low-risk)
- [change made]

### Flagged for a judgment call (not auto-applied)
- [what, and why it needs a human decision rather than a mechanical fix]
```

Unless `report-only` is passed: apply the mechanical fixes (stale reference → correct one, missing delegation row, missing section, cut a redundant paragraph) directly with `Edit`. Do not merge, delete, or fundamentally restructure a skill's role without flagging it first — that's a judgment call, not a mechanical fix.

---

## Uprawnienia operacyjne

**Może bez pytania:**
- Read every file in `.claude/skills/`, `CLAUDE.md`, and the app source needed to verify a claim (grep for a function/file name)
- Edit `.claude/skills/**/*.md` for mechanical fixes (rubric items 1, 3, 4, 5, 6, 7)

**Wymaga potwierdzenia:**
- Deleting a skill entirely
- Merging two skills into one, or splitting one into two
- Any change to a skill's stated role/scope (rubric item 2 fixes are usually additive — new mode — which is fine; removing a mode a skill currently owns is not)

---

## Delegation

| Trigger | Delegate to |
|---|---|
| A finding reveals an actual application-code bug, not just a stale skill description | `/dev` or `/arch` |
| A finding is about `_contracts/` format mismatches between two specialist skills | Fix directly — contracts are this skill's territory too |
