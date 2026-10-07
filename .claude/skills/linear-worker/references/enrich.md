### 5. Enrich
Run `/enrich-user-story` against the ticket's title + description. If it surfaces Open Questions you cannot answer confidently — same standard the skill already applies to a human ("ask, don't assume") — stop:
- Comment the specific open questions on the ticket, verbatim.
- Move to `Blocked`.
- End with a clean working tree.

If classified `trivial` or `feature` with no blocking open questions, proceed. For `feature`, save the Refined User Story to `docs/stories/` as the skill normally requires.

**Platform vs. client line (mandatory, `feature`-classified tickets only).** Add one explicit line to the saved story doc, under the 🚀 NeoCRM/Platform stakeholder note: is this change generalizable to any white-label tenant (`platform`), or specific to the current tenant (`client:<slug>`, name it)? This is not a new lens — it sharpens the lens that already exists there into a literal, non-skippable statement instead of optional prose, since this platform is white-label and a change that quietly bakes in one tenant's assumptions is easy to miss otherwise. This value is what the completion Artifact's marker file records as `hoisting`.

**Ambiguity check.** If the ticket's implementation isn't an obvious single path — a new entity/schema shape, more than one reasonable UI pattern, a data-modeling choice with real trade-offs — invoke `/arch assess [feature]` yourself and follow [_contracts/arch→linear-worker.md](../../_contracts/arch→linear-worker.md). Arch's verdict (`single-path` or `ambiguous`) is what Step 6.5 below keys off. If arch itself is unsure, treat it as `ambiguous` — same safe-default posture arch already applies to itself ("ask, don't assume"). Skip this check entirely for straightforward tickets (a new field, a UI tweak, a bug fix) — invoking arch on every ticket regardless of need would just slow down the obvious cases for no benefit.

