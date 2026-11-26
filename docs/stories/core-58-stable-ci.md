## Refined User Story: CORE-58 Stable CI, keeping it green

**Classification**: feature (internal tooling)
**Raw input**: "Fix 58." CI on dev was red every second run until CORE-208 pinned the test job to ubuntu-24.04 (2026-11-16). Since then dev is green, so the remaining work is to keep it that way and to know when the pin can go. Decisions: form core-58-plan-r1 (2026-11-17), Q3 and Q4; Q1 and Q2 became moot after CORE-208.

### As the person who merges to dev, I want CI to tell me by itself when it is stable enough to tighten and when the runner pin can be lifted, so that I never read run logs to find out

### Stakeholder Notes
- 👤 User: Łukasz and the Claude sessions that wait for a green CI before handing over a PR link.
- 🏢 Client: indirect. A red dev blocks every fix for every tenant.
- 🩺 Patient: no downstream patient effect.
- 🚀 NeoCRM/Platform: platform-wide, no tenant data. The board stays the one place where work is announced.
- ⚖️ Compliance: no early flags. Read-only on GitHub; board comments carry run links only.

### Medical-Industry Trend Check
- n/a, internal/infra change.

### Acceptance Criteria
- [ ] A nightly flake hunt runs the WebKit e2e suite 3 times with no retries on ubuntu-24.04 and on ubuntu-latest; the summary lists the failure rate per test and engine for each image.
- [ ] A push to a work branch that changes e2e spec files runs only those files, 20 times, on all three engines; with no spec file changed, the whole suite twice on WebKit.
- [ ] The ubuntu-latest leg is a measurement: it never turns the run red.
- [ ] Manual inputs that are not spec paths, a count from 1 to 50 or known engines are refused.
- [ ] A nightly CI health run counts green runs in a row on dev (cancelled runs neither count nor break the streak) and writes the numbers to its summary.
- [ ] At 10 green in a row with `tooling` / `api-image` still optional, CORE-63 gets one comment with the ready change; `ci-health.mjs --require` adds only the missing checks and keeps every other rule.
- [ ] When the API test step failed in a dev run of the last 24 h, CORE-35 gets one comment with the run links.
- [ ] When the ubuntu-latest leg passed 3 nights in a row, CORE-242 gets one comment with the ready change.
- [ ] A ticket that already carries a signal's marker gets no second comment.

### Decided by default (a test proves it)
- No test is rewritten (`settleLayout()` from the old branch is not ported): dev has been green since CORE-208, and the nightly table will name any test that still fails.
- The automation cannot create tickets (agent rule of the board), so it comments on existing ones: CORE-63, CORE-35, CORE-242.
- Making a check required is one command for a repo admin; the workflow token cannot change rulesets.
- This replaces decision D3 of 2026-09-29 (required after one week green).

### Open Questions
- none

### Hand-off
→ `/dev`, scope is clear and self-contained.
