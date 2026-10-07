### 6.5. Conditional double-implementation pass — only when Step 5 flagged `ambiguous`

Skip this step entirely for every `single-path` ticket — it exists specifically to spend extra effort where the ticket doesn't have one clearly-correct approach, not as a blanket doubling of cost.

1. Implement **Attempt A** (Step 6 above), then capture it — commit it to a throwaway local branch (`worker/<ticket>-attempt-a`) or save its diff to a temp file. Do not push this branch.
2. `git reset --hard` back to the pre-implementation commit.
3. Implement **Attempt B** independently, following the same ticket and the same `/arch` guidance, but without re-reading Attempt A's specific code. (Caveat, stated plainly rather than papered over: true independence between the two attempts is limited within one continuous context — this reduces but doesn't eliminate the value of a second pass.)
4. Compare both against an explicit rubric: how many Acceptance Criteria have real test coverage, diff simplicity (file/line count — smaller is better *unless* it under-delivers on the ticket), and adherence to CLAUDE.md's naming/i18n/architecture conventions. State a winner with a one-to-two-sentence rationale.
5. Keep the winning attempt as the real working tree state; discard the losing branch — but keep a one-paragraph summary of what it did differently and why it lost, for the completion comment (Step 9).
6. Proceed to Step 7 self-check against the winning attempt only.

