---
name: skill-doctor
description: Health-metrics check for the .claude/skills/ setup itself — description-budget usage, SKILL.md length against the 500-line guidance, and weak/generic descriptions that won't reliably auto-trigger. Use when asking "is /skill-doctor a thing", "are our skill descriptions good", "will my skills get truncated", or before/after adding new skills to check the listing budget.
argument-hint: "[all | <skill-name>]"
---

# Skill Doctor

> **Focus**: $ARGUMENTS — `all` checks every skill, a name checks one. Empty defaults to `all`.

There is no built-in `/skill-doctor` command in this Claude Code version (confirmed 2026-09 — `/skill-doctor` returns "Unknown command"). This skill exists to do that job manually, using the same constraints Claude Code documents for itself: a per-skill description cap (`skillListingMaxDescChars`, default 1536) and a total-listing budget (`skillListingBudgetFraction`, default 1% of the model's context window). This is a **different job from `/skill-auditor`**: skill-auditor checks whether a skill's *content* is accurate and complete; skill-doctor checks whether a skill's *packaging* (length, description wording) gives it a fair chance of being found and trusted at all. Run both — neither substitutes for the other.

> **IMPORTANT**: All output — English only.

**Live state** (read on every invocation):
- Skill count: !`ls -d /Users/lukasz512/Documents/Private/NeoSleep/.claude/skills/*/ 2>/dev/null | wc -l`
- Command count (separate listing, same budget pressure): !`ls /Users/lukasz512/Documents/Private/NeoSleep/.claude/commands/*.md 2>/dev/null | wc -l`

---

## Checks

### 1. SKILL.md length vs. the 500-line guidance
```bash
for f in /Users/lukasz512/Documents/Private/NeoSleep/.claude/skills/*/SKILL.md; do
  n=$(wc -l < "$f"); [ "$n" -gt 500 ] && echo "$n  $f"
done
```
Anything over 500 lines should move detail into `assets/` or `references/` files, linked from the body — the guidance is to keep SKILL.md itself lean and lazy-load detail only when actually invoked. As of 2026-09: `arch/SKILL.md` is the one outlier (625 lines) — everything else is under 250.

### 2. Description length vs. the per-skill cap
```bash
for f in /Users/lukasz512/Documents/Private/NeoSleep/.claude/skills/*/SKILL.md; do
  d=$(awk '/^description:/{sub(/^description: */,""); print; exit}' "$f")
  echo "${#d}  $f"
done | sort -rn
```
Cap is 1536 chars by default (`skillListingMaxDescChars`). As of 2026-09, the longest description in this repo is ~400 chars — nowhere near the cap. Re-run this after adding new skills; flag anything over ~1000 as a candidate to tighten.

### 3. Total listing budget
Sum every skill's description length + every command file's presence, compare against `skillListingBudgetFraction` (default 1% of context window — for a ~200K-token model that's roughly 8000 characters of listing text). As of 2026-09: ~6000 characters across 19 skills — under budget, but re-check this any time skill count grows past ~25-30, since that's when truncation (silently dropping the least-recently-used skills' descriptions first) becomes a real risk. If truncation is suspected, raise `skillListingBudgetFraction` or `skillListingMaxDescChars` in `.claude/settings.json` — but that trades context tokens spent every turn for more visible skills, so treat it as a last resort after trimming/consolidating first.

### 4. Weak vs. strong descriptions
A strong description states **what** the skill does AND **when to use it** in words the user would actually type, front-loaded in the first sentence (Claude weighs early tokens in the description more — and truncation, if it happens, cuts from the end). Flag any description that:
- Is a single noun phrase with no "Use when..." / "Use for..." clause
- Doesn't contain at least 2-3 concrete trigger words distinct from the skill name itself
- Buries the trigger words after a long preamble

```markdown
Weak:  "description: Code review"
Strong: "description: Review code for correctness bugs and refactoring opportunities.
         Use when asking about a diff, code quality, or suggesting simplifications."
```

### 5. What this skill cannot tell you
No access to actual invocation telemetry (which skills get used, which sit dead). That judgment call is yours — if you never reach for `/marketing` or `/ceo`, that's real signal this skill-doctor has no way to compute. Redundancy between skills (two skills covering the same ground) is `/skill-auditor`'s rubric item #5, not this skill's job.

---

## Output Format

```markdown
## Skill Doctor Report — [date]

### Length
| Skill | Lines | Status |
|---|---|---|
| arch | 625 | ⚠️ over 500 — move detail to assets/references |
| ... | ... | ✅ |

### Description budget
Total: [N] chars / ~[budget] char estimated budget — [OK / approaching / re-check skill count]

### Weak descriptions
- [skill]: [why it's weak] → suggested rewrite

### Recommendation
[1-3 sentences — what to fix first, in priority order]
```

---

## Delegation

| Trigger | Delegate to |
|---|---|
| Description/length issue traced to actual content being wrong, not just verbose | `/skill-auditor` |
| Two skills look redundant, not just individually too long | `/skill-auditor` (rubric #5) |
