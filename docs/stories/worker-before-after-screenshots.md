## Refined User Story: Before/after screenshots on worker-completed tickets

**Classification**: feature
**Raw input**: Want the nightly linear-worker to automatically attach "before" and "after" screenshots to tickets it completes — e.g. for a notification-style change, a screenshot before and one after. These should land (1) as a Linear attachment/comment on the ticket, and (2) in the GitHub PR description. Context: the worker never opens a PR itself (hard rule) — it only pushes a branch and leaves a "create a pull request" link in a Linear comment, so "into the PR description" has to go through either a ready-to-paste description block or a pre-filled PR-creation URL. The worker's last validation run already rendered a before/after preview (`preview.html` + screenshot) to self-verify a CSS fix on `AppIcon.vue`, so the rendering mechanism is proven for at least one case — question is how to generalize and wire it into Linear/GitHub.

### As a Łukasz (reviewing worker output), I want to see a before/after screenshot on every visual ticket the worker completes, so that I can judge a UI change at a glance without checking out the branch myself, both from the Linear ticket and from the PR the worker's link takes me to.

### Stakeholder Notes
- 👤 User: Not rep/KAM/FFM/MSL/HCP-facing — the "user" is Łukasz in his reviewer role. Today he has to check out `worker/*` branches locally to see what a UI-affecting ticket actually changed; this closes that gap without needing him present.
- 🏢 Client: No direct tenant-facing effect — this is internal dev tooling, not something a pharma client sees. Indirect benefit: faster, higher-confidence review of unattended overnight work should mean UI fixes/features reach tenants sooner with lower regression risk.
- 🩺 Patient: No direct patient-safety effect, but one real constraint: any screenshot must only ever show synthetic/fixture data, never anything resembling a real patient/HCP record — same rule ADR-019 already established for the worker's `test` schema. Worth stating explicitly here since a screenshot is a new *visual* surface that could leak real-looking data in a way a code diff wouldn't.
- 🚀 NeoCRM/Platform: Not a customer-facing platform capability, doesn't affect white-label sale. It does generalize cleanly as a reusable "visual evidence" pattern for autonomous work, built on the same rendering mechanism already proven for the icon fix — low incremental cost to build it properly now rather than one-off it later.
- ⚖️ Compliance: Same synthetic-data-only constraint as above (Patient row). Separate technical/compliance-adjacent question: if screenshots get committed into the worker's branch so GitHub can display them via a raw-content URL, they become permanent git history on `dev` once merged — needs a deliberate decision on where they live and whether they're worth keeping forever per ticket, not an assumption.

### Medical-Industry Trend Check
n/a — internal dev-tooling/workflow change, not a clinical or HCP-facing feature.

### Acceptance Criteria (testable — if QA can't verify it, it's too weak)
- [ ] For a ticket the worker classifies as having a visible UI change, it captures a "before" screenshot prior to editing and an "after" screenshot once the change is implemented.
- [ ] Both screenshots are attached to the worker's completion comment on the Linear ticket (visible directly in Linear, no extra click).
- [ ] The GitHub "create a pull request" link the worker leaves on the ticket results in a PR whose description already shows the before/after images once Łukasz opens it — via whichever mechanism Open Questions below resolves to.
- [ ] No screenshot ever contains data other than synthetic/fixture content.
- [ ] Tickets with no visual/UI component are not forced through a meaningless screenshot step.

### Open Questions — resolved 2026-09-16
- [x] **Image hosting**: commit to the worker's own branch under `docs/worker-screenshots/<ticket-id>/before.png` + `after.png`, referenced via `raw.githubusercontent.com`. Accepted trade-off: these become permanent git history once a PR merges to `dev`.
- [x] **PR delivery**: the worker builds the "create a pull request" link with `?title=...&body=...` pre-filled (GitHub's compare/new-PR URL supports this) instead of leaving a separate block to paste — Łukasz still clicks "Create" himself, no rule violation.
- [x] **Capture scope**: isolated component/style renders only (same static-render technique already proven on the `AppIcon.vue` fix) — not full authenticated app screenshots. This bounds the feature to self-contained visual tweaks; a ticket needing a full-page/authenticated view is out of scope for this mechanism.
- [x] **Trigger**: worker judges per-ticket whether a visual component render is applicable — no new Linear label required.

### Hand-off
→ `/arch assess worker-before-after-screenshots` — screenshot capture mechanism, image hosting/lifecycle decision, and the GitHub pre-filled-URL approach are all architectural calls that need to be settled before this is small enough for `/dev` to just build.
