## Refined User Story: Nightly Autonomous Linear Worker

**Classification**: feature
**Raw input**: Build a nightly automated worker for NeoCRM: Łukasz writes tasks in Linear (description + screenshots/mockups), overnight a cloud Claude Code agent (RemoteTrigger, same mechanism as the existing weekly health-report routine) reads tickets marked ready, runs each through /enrich-user-story → implementation → quality-gate (lint/typecheck/test/depcruise + docs), branches + pushes (never opens a PR itself), and leaves a PR link as a comment on the Linear ticket. Requires: (1) connecting Linear as an MCP connector, (2) designing a Linear ticket format the worker understands (status/label + attachments), (3) deciding how many tickets per night and what happens when quality-gate fails (self-fix vs. leave a note and move on).

### As Łukasz (solo founder / sole developer), I want to write a task in Linear during the day and wake up to a pushed branch + PR link, so that implementation throughput isn't bottlenecked by my own live Claude Code sessions.

### Stakeholder Notes
- 👤 User: Łukasz, in the developer/PM role — not a rep/KAM/MSL/HCP persona. Today's workaround is pasting the same ticket into a live Claude Code session by hand; this removes that manual trigger step, not the review step (he still reviews and opens the PR himself, per existing PR-only policy).
- 🏢 Client: No direct tenant-facing effect. Indirect only, via faster iteration speed on tenant-requested features.
- 🩺 Patient: No new *direct* patient-safety surface beyond what any code change already carries — but the risk *shape* changes: today a human is live in the loop while identity/auth/consent/audit_log code is written; here that code can be written unattended overnight. Mitigation must be at least as strict as manual changes: quality-gate's existing risk-touched → requires .spec.ts check, and nothing merges or deploys without Łukasz opening the PR himself. This should be treated as a hard invariant, not a nice-to-have.
- 🚀 NeoCRM/Platform: Pure internal dev-tooling — reusable regardless of tenant, not something tenants see or pay for. No white-label angle.
- ⚖️ Compliance: Two flags, not full analysis: (1) Linear tickets may carry screenshots/mockups — confirm none ever contain real patient/HCP data, only synthetic mockups, since ticket content will be read into a cloud agent context. (2) Commits authored by an unattended overnight agent need clear provenance (co-author trailer, branch naming) so `git blame`/audit trail isn't ambiguous about human vs. agent authorship — worth a one-line convention, not a legal review.

### Medical-Industry Trend Check
n/a — internal dev-tooling/CI automation, not a clinical or pharma-rep-facing practice.

### Acceptance Criteria
- [ ] Linear MCP connector is active for this account (manual step at claude.ai/customize/connectors — cannot be done by the agent itself)
- [ ] A documented Linear ticket contract (status/label that means "ready for worker", required fields, how attachments are read) exists and is referenced by the routine's prompt
- [ ] A RemoteTrigger routine exists, modeled on the existing weekly health-report trigger (`trig_013DjoW5C8PeieZRCVJtQ83L`): scoped `allowed_tools`, git_repository source, `persist_session: false`
- [ ] For each eligible ticket the routine runs: /enrich-user-story → implementation → quality-gate → branch + push (never `dev`/`prod`, never opens a PR) → PR-creation URL posted back as a Linear comment
- [ ] If quality-gate fails or /enrich-user-story surfaces open questions the agent can't answer unattended, the ticket is left with a comment explaining what's blocking it, and the worker moves to the next ticket — it does not guess on compliance-sensitive code to force a pass
- [ ] Nightly ticket volume is capped at an explicit number (not "all ready tickets" unbounded)
- [ ] Written record of how this differs from the existing quality-gate.sh Postgres-dependency: the cloud RemoteTrigger environment used for health-report explicitly has **no local Postgres**, and quality-gate.sh hard-fails when Postgres isn't reachable on 127.0.0.1:5432 — this needs a resolution before the worker can ever pass its own gate

### Open Questions
- [ ] Which Linear status/label marks a ticket "ready for worker" — a new custom status, or reuse of an existing one?
- [ ] Cloud environment Postgres: does the RemoteTrigger environment (`env_01YSpYo4SR1JAurMXBNAW8Hj` or a new one) provision a real Postgres for this worker, or does quality-gate.sh need a cloud-aware branch (like health-report's own "skip DB-dependent checks in cloud" carve-out)? This blocks everything else — quality-gate is a hard Stop-hook block, not a warning.
- [ ] One ticket per night, or all ready tickets, or a capped number (e.g. 3)?
- [ ] On quality-gate failure: attempt self-fix (how many retries?) or always skip-and-comment on first failure?
- [ ] Any file-path/scope guardrails — e.g. should the worker be blocked from touching migrations, `auth.ts`, `identities`/`consent`/`audit_log` code unattended, deferring those tickets to a human session regardless of ticket label?
- [ ] Does the worker branch from `dev` (matching `worktree.baseRef: fresh` default), and is there a naming convention (e.g. `worker/<linear-id>-<slug>`) to keep it distinguishable from human branches?

### Hand-off
→ `/arch assess nightly-linear-worker` — touches RemoteTrigger config, hook/gate interaction, and cross-cutting automation architecture; open questions above must be resolved with Łukasz first since several are policy decisions, not technical unknowns.
