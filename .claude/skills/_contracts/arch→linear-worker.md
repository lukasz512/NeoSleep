# Contract: arch → linear-worker

> **What this file is**: A formal interface between the Software Architect skill and the `linear-worker` skill.
> When linear-worker calls arch for an ambiguity assessment, it passes input in the format defined here.
> When arch responds, it returns output in the format defined here.
> This prevents ambiguous handoffs and makes orchestration predictable.
>
> Think of this as a TypeScript interface for skill-to-skill communication.

> **Note on direction**: every other file in `_contracts/` (`arch→dba.md`, `arch→qa.md`, `arch→legal.md`) is named for the direction arch delegates *out* to a specialist. This one is the reverse: `linear-worker` calls *into* arch, not the other way round. There is no precedent for this direction elsewhere in the repo (confirmed by grep across `_contracts/` before writing this) — it exists because `linear-worker` runs unattended overnight and has nobody else to ask "is this ambiguous?" except arch itself.

---

## When linear-worker calls arch

`linear-worker`'s Step 5 (Enrich) calls this contract when a `feature`-classified ticket's implementation isn't an obvious single path — a new entity/schema shape, more than one reasonable UI pattern, a data-modeling choice with real trade-offs. It is not called for straightforward tickets (a new field, a UI tweak, a bug fix) — invoking arch on every ticket regardless of need would slow down the obvious cases for no benefit.

The verdict returned here is what `linear-worker`'s Step 6.5 keys off: `ambiguous` triggers a conditional double-implementation pass (implement twice, compare against an explicit rubric, keep the more coherent attempt); `single-path` proceeds straight to a single implementation.

---

## INPUT FORMAT — linear-worker → arch

```markdown
## Linear-Worker Task: ambiguity-assessment

**Context**: [1-2 sentences — what the ticket asks for]
**Priority**: blocking (the worker cannot proceed past Step 5 without this verdict)
**References**: [link to the saved docs/stories/*.md Refined User Story]

### Refined User Story

[the full five-lens output from Step 5's /enrich-user-story run — User/Client/Patient/Platform/Compliance notes, Acceptance Criteria, and the mandatory Platform vs. Client line]
```

---

## OUTPUT FORMAT — arch → linear-worker

```markdown
## Arch Response: ambiguity-assessment

**Verdict**: [single-path | ambiguous]

### Viable Approaches (only if Verdict = ambiguous)

1. [approach name] — [1-2 sentences: what it does, main trade-off]
2. [approach name] — [1-2 sentences: what it does, main trade-off]
3. [approach name, if a genuine third exists] — [1-2 sentences]

**Recommendation**: [which to try as Attempt A, and why — the worker still implements all flagged approaches across its two attempts, but this ordering matters for Attempt A vs. B]

### Rationale (only if Verdict = single-path)

[1-2 sentences on why this ticket has one clearly-correct implementation path despite being feature-shaped enough to reach this check]
```

---

## Escalation Rules

Arch does not implement anything here — it only classifies. If arch itself is genuinely unsure whether a ticket has one clear path, it returns `Verdict: ambiguous` rather than guessing `single-path` — the same "ask, don't assume" posture arch already applies everywhere else in `.claude/skills/arch/SKILL.md`. A wrong `ambiguous` verdict costs the worker a second implementation attempt; a wrong `single-path` verdict risks shipping the worse of two approaches with no comparison ever happening — the asymmetry favors defaulting to `ambiguous` when in doubt.

`linear-worker` does not re-litigate arch's verdict — it is not equipped to judge architectural ambiguity itself, which is the entire reason this contract exists.

---

## SLA

| Priority | Arch response target |
|---|---|
| blocking | Same session (the worker's Step 5 cannot proceed without it) |
