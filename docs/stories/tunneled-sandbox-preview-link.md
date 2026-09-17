## Refined User Story: tunneled sandbox preview link

**Classification**: feature (internal dev-tooling workflow change — not user/tenant/patient-facing)
**Raw input**: "I need to change the workflow: instead of a PR, I want a link to a sandbox for testing on localhost — how do we do this? Help me plan this well. Task executability still isn't satisfactory for me. We need to hook up hooks better." Asked to choose between an ephemeral preview deploy per branch vs. a tunneled local dev server, Łukasz chose: tunneled local dev server.

### As Łukasz (repo owner reviewing both interactive-session and nightly-worker output), I want a live, clickable URL to the actual running app for a branch's changes, so that I can click through and test a UI change on any device before deciding whether to open a PR — not just read a diff.

### Grounded current-state findings (code investigation, 2026-09-17)
1. **NEO-33 already solved half of this**, merged into `dev` 2026-09-16. `pnpm worker:test <branch>` (`infrastructure/scripts/worker-test.sh`) fetches a branch into its own dedicated sibling git worktree, runs `pnpm install`, builds `@neo/pwa`, and opens the folder in VSCode. It stops there — no dev server, no URL, wired only into the linear-worker's ticket-completion comment.
2. **`pnpm dev` already starts the full local stack** in one command (`apps/api` + `apps/pwa` + `apps/web` concurrently, `package.json`).
3. **Only one port needs tunneling.** `apps/pwa/vite.config.ts` already proxies `/api`, `/auth`, `/health` to the local API server — so tunneling the pwa's Vite dev port alone exposes a fully working app (API calls included), no need to tunnel the API port separately.
4. **No tunnel tool is installed yet** on this machine (checked for both `cloudflared` and `ngrok` — neither present).
5. **This doesn't touch the PR-only merge policy.** CLAUDE.md's rule that Łukasz always creates the actual PR, and that `dev`/`prod` reject direct pushes, is unaffected — this is a pre-PR review aid, not a replacement for the merge gate.

### Stakeholder Notes
- 👤 User: Solely Łukasz, in his role as the human reviewer/gatekeeper of both interactive Claude Code sessions and `linear-worker` output. Today he either reads a GitHub diff cold, or manually reconstructs a local checkout himself.
- 🏢 Client: No direct tenant impact — internal engineering tooling, not something a pharma tenant sees or pays for.
- 🩺 Patient: No downstream effect — purely a local dev-workflow convenience.
- 🚀 NeoCRM/Platform: Not white-label-relevant; hardens this repo's own delivery process (same category as NEO-33), doesn't generalize to tenants.
- ⚖️ Compliance: Flag, not a blocker — a tunnel exposes a running instance of the app (real branded UI, hitting whatever DB the worktree's `.env` points at) to a public-but-unguessable URL for as long as it's up. The app's own login screen still gates it, but the URL itself shouldn't be long-lived or shared beyond Łukasz. Needs a lifecycle answer (see Open Questions) rather than a tunnel left running indefinitely.

### Medical-Industry Trend Check
n/a — internal change (dev tooling / delivery workflow, not a rep/HCP/patient-facing feature).

### Acceptance Criteria (testable — if QA can't verify it, it's too weak)
- [ ] A single command, run from a worktree (interactive session's `.claude/worktrees/*` or a `worker:test`-created one), starts `pnpm dev` scoped to that worktree and exposes the pwa's Vite dev port through a tunnel, printing a working URL.
- [ ] The URL is reachable from a phone or another machine, not just `localhost` — proxied `/api`/`/auth`/`/health` calls work through it exactly as they do locally.
- [ ] Two worktrees can each run their own tunneled dev server at the same time without port or tunnel-name collisions (same per-worktree isolation precedent as `worker-test.sh`).
- [ ] The tunnel is torn down when the dev server stops (no orphaned tunnels left publicly reachable after Łukasz is done).
- [ ] An interactive Claude Code session surfaces this link itself once UI-touching work is ready to look at — Łukasz shouldn't have to remember to ask for it.
- [ ] The linear-worker's ticket-completion comment includes the live tunnel URL alongside (or instead of) today's `pnpm worker:test <branch>` command.
- [ ] Clear, actionable error if the tunnel binary isn't installed/authenticated on Łukasz's machine — never a silent failure.
- [ ] No change to the PR-only merge policy: this produces a link for review, not a merge path. `dev`/`prod` push protections and "Łukasz creates the PR" stay exactly as documented in CLAUDE.md.

### Open Questions — RESOLVED (answers from Łukasz, 2026-09-17)
- [x] Tunnel provider: Cloudflare Tunnel quick-tunnel (no account needed). URL rotates per run — acceptable, this is a short-lived review link, not a bookmark.
- [x] DB isolation: shared dev DB (same as `pwa-dev.neosleepcare.com` and other worktrees) is fine for now — not solving cross-session data collisions in this story.
- [x] Scope: both `apps/pwa` and `apps/web` get tunneled links (two ports, two URLs, or a small router in front of both — implementation's call).
- [x] "Hook up hooks better" is the same complaint as not being able to test changes — satisfied once a session surfaces a working link automatically; no separate `.claude/hooks/*` investigation needed.

### Open Questions — RESOLVED at implementation (2026-09-17)
- [x] linear-worker cloud-sandbox extension: deferred, explicitly out of scope. The worker keeps using `pnpm worker:test <branch>` as its completion-comment command; `pnpm sandbox` is a manual follow-up Łukasz runs afterward on his own machine, mentioned in the same comment.
- [x] Lifecycle/timeout: no idle auto-timeout in v1. `pnpm sandbox` is idempotent (a rerun against an already-running sandbox just reprints the same URLs); `pnpm sandbox:down` explicitly tears it down.

### Hand-off
→ `/devops` — tunnel provider choice, script design (extending `infrastructure/scripts/worker-test.sh` vs. a new script), lifecycle/teardown mechanics
→ `/arch assess` — whether/how this wires into the Stop-hook (`quality-gate.sh`) so the link is surfaced automatically rather than on request
→ `/dev feat` — implementation once provider and scope questions above are answered
