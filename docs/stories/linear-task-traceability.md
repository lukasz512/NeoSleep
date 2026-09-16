## Refined User Story: Linear ticket ↔ worktree/branch ↔ PR traceability

**Classification**: feature
**Raw input**: Łukasz wants a consistent chain of traceability between a Linear ticket, the git worktree/branch created for it, and the resulting PR. Today this gets lost — he starts a new task, a new worktree is created, but nothing links back to Linear automatically (no ticket ID in the branch name, no comment/link left on the Linear issue, no clear line from PR back to the ticket that spawned it). He also floated a larger idea: replacing Notion entirely with Linear as the project's single internal tracker ("Jira replacement"), since he prefers Linear and Notion is currently referenced as a future ticket-system integration point in [project_partner_incident_reporting_automation.md](../../.claude/projects/-Users-lukasz512-Documents-Private-NeoSleep/memory/project_partner_incident_reporting_automation.md) (not yet built).

### As Łukasz (repo owner, working solo with Claude Code across many parallel worktrees), I want every task's worktree/branch and PR to carry a visible link back to its Linear ticket, so that I can reconstruct why a change exists without relying on memory.

### Stakeholder Notes
- 👤 User: Łukasz himself is the user here — not a rep/KAM/pharma end user. The job: when he opens a branch, a worktree, or a PR weeks later, he needs to know which Linear ticket it came from without guessing from the diff or commit history. Today's workaround is manual memory, which he's explicitly said he loses.
- 🏢 Client: No direct tenant-facing effect — this is internal delivery tooling, not a product feature a pharma tenant sees. Indirect benefit: better traceability strengthens the audit trail for "who requested this change and why" on a compliance-sensitive medical CRM, which matters if a tenant or auditor ever asks for change history.
- 🩺 Patient: No downstream effect — internal engineering process only.
- 🚀 NeoCRM/Platform: This doesn't sell to future white-label tenants directly, but it's worth building generally rather than as a one-off, because [nightly-linear-worker.md](nightly-linear-worker.md) / ADR-019 already proved Linear MCP integration works in this repo (ticket → branch `worker/<ticket-id>-<slug>` → comment-back-with-PR-link). This story should reuse that proven pattern for human-initiated work instead of inventing a second convention.
- ⚖️ Compliance: No new legal exposure from the traceability piece — if anything it helps GDPR/audit posture (clearer record of change provenance). One real flag: if Notion currently holds any compliance-relevant records (signed docs, DPA references, incident-process notes), those need a deliberate export/archive step before any Notion deprecation — not a silent deletion. → early flag only, not a decision here.

### Medical-Industry Trend Check
n/a — internal engineering/tooling change, not a clinical or HCP-facing workflow.

### Acceptance Criteria
- [ ] CLAUDE.md's "Git / PR Workflow" section documents a branch/worktree naming convention that encodes the Linear ticket ID (e.g. reusing linear-worker's existing `<type>/<ticket-id>-<kebab-slug>` shape for human-initiated branches too), so `git branch`/`git worktree list` alone identifies the originating ticket.
- [ ] There's a documented step — manual or tool-assisted — for leaving a link/comment on the Linear ticket when a worktree/branch for it is created, so the ticket shows the branch before a PR exists.
- [ ] The PR description template/convention includes a Linear reference (ticket ID and/or a magic-word link, e.g. "Fixes ENG-123") so Linear's own GitHub integration (if connected) can auto-link or auto-close the ticket on merge.
- [ ] The convention is written down in one place (CLAUDE.md, referenced from the relevant skill(s)) rather than living only in this story.
- [ ] Full Notion→Linear migration is explicitly named as out of scope for this story (tracked as a separate decision — see Open Questions) so it doesn't silently expand this piece of work.

### Open Questions
- [ ] Does Łukasz want this **automated** (e.g., `EnterWorktree` naming convention enforced/suggested, a helper script, a hook) or is a **documented manual convention** he follows himself enough for now? Changes the whole build size.
- [x] Is Linear's native GitHub integration already connected to this repo/org? **Confirmed 2026-09-16: yes** — ticket-ID-in-branch-name and "Fixes ENG-123" in PR bodies auto-link/auto-close with zero extra code.
- [ ] Does *every* task go through a Linear ticket, or only some (quick fixes, typo-level work)? What's the fallback for untracked work so the convention doesn't force ticket creation for trivial changes?
- [ ] Should this reuse `linear-worker`'s existing `worker/<ticket-id>-<slug>` branch pattern verbatim for human-initiated worktrees, or use a distinct prefix (e.g. `feat/<ticket-id>-<slug>`) to visually distinguish human work from the nightly worker's?
- [ ] Notion→Notion-replacement scope: is retiring Notion as the internal tracker its own decision (recommend a separate `/product` scoping pass, possibly an ADR via `/arch`), given it touches the not-yet-built ticket-system plan in [project_partner_incident_reporting_automation.md](../../.claude/projects/-Users-lukasz512-Documents-Private-NeoSleep/memory/project_partner_incident_reporting_automation.md)? Recommend treating it as a separate follow-on story rather than bundling into this one.

### Hand-off
→ `/product` — to confirm scope split (traceability convention now vs. Notion migration as a separate, later decision) and prioritize against Stage 2 work.
→ `/arch assess linear-task-traceability` — to decide the actual mechanism (naming convention only vs. hook-assisted) and write it into CLAUDE.md/relevant skills once scope is confirmed.
