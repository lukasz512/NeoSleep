### 9. On success — commit, branch, push

**Screenshots (best-effort, never blocking):** you reach this point only after Step 7 has already passed — nothing here is ever a self-check failure, never triggers `Blocked`, and never gets a retry. Skip any of the following silently if it doesn't apply; don't mention a skip in the completion comment.
- **Judge applicability yourself** — no new label for this. Does the diff include a self-contained visual change (a single Vue SFC or style file) that can be rendered in isolation, the same class of change as the `AppIcon.vue` fix from an earlier validation run? If the change spans multiple interacting components, needs live app/auth/routing state, or is backend-only/non-visual, there's nothing to do here — move straight to the commit bullet below.
- **No "before" for a brand-new file.** If the changed visual file didn't exist at `git HEAD`, skip the pair for that file — there's no meaningful before state.
- **Sourcing**: "before" = `git show HEAD:<path>` (HEAD is still unmodified at this point in the procedure — nothing has been committed yet); "after" = the current working tree file, post-edit.
- **Render technique**: use whatever image-rendering/screenshot capability this cloud environment already provides at the runtime level — the same one that produced `preview.html`/`preview.png` for the `AppIcon.vue` validation. This is **not** a repo dependency — do not add Playwright, Puppeteer, Chromium, or any other headless-browser package to any `package.json` for this. That would repeat the Docker-in-cloud mistake ADR-019 already tried and reversed for this same worker (see its 2026-09-10 update): unwanted infra Łukasz doesn't want to maintain, for a capability the environment already provides another way.
- **Output paths**: `docs/worker-screenshots/<ticket-id>/before.png` and `.../after.png`. Any scratch render harness (e.g. a temporary `preview.html`) is not committed — only the two PNGs land in the repo.
- **Synthetic-data guardrail, actively confirmed, not assumed**: the render must show only fixture/placeholder props or content, never anything resembling a real patient/HCP record — same rule as the `test` schema (ADR-019's Compliance Impact section), extended here to a new visual surface.
- **Graceful skip**: no rendering capability this run, the change isn't isolatable, or the render fails for any reason — skip silently and continue with the rest of this step unchanged.

- **If screenshots were produced**, link both PNGs on the card (`add_links`, kind `other`, their GitHub blob URLs on the pushed branch) and mention them in the completion comment. If no attachment capability is available in this session, fall back to putting the two `raw.githubusercontent.com` links directly in the comment text instead — same "note it, don't block on it" fallback this file already uses for unreadable ticket attachments (see the Ticket Contract's "Fields read" bullet).

**Completion Artifact (mandatory, not best-effort — `feature`-classified tickets).** Build and publish a visual Artifact with exactly three sections, following the `artifact-design`/`artifact-diagramming` skills for craft but keeping it condensed — ask "what's actually essential here" before publishing, not a wall of detail:
1. **What changed** — masthead + status pills, plus, **whenever the diff touches any `.vue`/`.css` file, an actual before/after visual comparison** (not optional in that case — see below).
2. **Run it locally** — one line: the `.vscode/tasks.json` "Start NeoCRM Dev Stack" task, or `pnpm start` from a terminal.
3. **Verify it** — the Test Coverage Map's Acceptance Criteria, rendered as a numbered QA checklist of concrete actions (open X, click Y, expect Z).

**The before/after requirement, hardened 2026-09-20 (NEO-9):** a ticket that changes any Vue/style file needs a real before/after shown in "What changed", not prose describing the change — that gap (three text sections, no visual) is exactly the "AI slop" the artifact requirement exists to prevent. In priority order:
1. If Step 9's screenshot render succeeded, use those two PNGs (embed them or link the `raw.githubusercontent.com` URLs).
2. Otherwise (no render capability, or the change needs live app/auth state this run doesn't have), build a hand-authored HTML/CSS mockup reproducing the real component's actual colors/spacing/layout from its source, and label it clearly as a mockup, not a screenshot.
A wall of bullet points about what changed does not satisfy this — something the reader can actually look at does.

Link it on the card: PATCH `/items/<KEY>` with `add_links: [{kind: "artifact", url}]`. Then write `.claude/local/artifacts/<ticket-id>.json`:
```json
{
  "url": "<artifact url>",
  "hoisting": "platform | client:<slug>",
  "sections": ["summary", "run-locally", "qa-checklist"],
  "testCoverageMap": [ { "ac": "<short AC text>", "tests": ["<file> › <test name>"] } ],
  "visualComparison": "<omit only when no .vue/.css file changed; otherwise a short note on what before/after evidence exists and where — e.g. 'mockup embedded in artifact What changed section' or 'docs/worker-screenshots/<ticket>/before.png + after.png'>",
  "boardLinked": true,
  "boardCommented": true
}
```
This is the same marker schema `quality-gate.sh` enforces for interactive sessions — one convention, two enforcement paths. `boardLinked`/`boardCommented` record the `add_links` link above and the Step 9 comment. Interactive sessions build the same page with `/ship-artifact` (`.claude/skills/ship-artifact/build.mjs` renders it from one template). `quality-gate.sh` triggers this on any `.vue`/`.css` change (its `VISUAL_SHAPE` check), independent of whether the ticket also counts as `FEATURE_SHAPE` (new view/route/migration) — a layout- or component-only diff needs this exactly as much as a new view does.

- Commit with a clear message (screenshot PNGs, if produced, are included in this same commit). Include a co-authorship trailer identifying this as agent work, same convention as any Claude-authored commit in this repo, so `git blame` is never ambiguous about human vs. agent authorship.
- Branch name: `worker/<ticket-id>-<kebab-slug-of-title>`, created from `dev` (this repo's default branch — confirm via `git remote show origin` if unsure, never assume `main`).
- `git push -u origin worker/<...>`. Never push to `dev` or `prod`. **Never open a pull request** — this is a hard rule, not a preference (see CLAUDE.md's PR-only workflow).
- The completion comment includes a one-line local test command: `pnpm worker:test worker/<...>` (the exact pushed branch name). Running it locally pulls the branch into its own dedicated git worktree, installs deps, builds `@neo/pwa`, and opens it in VSCode — so Łukasz can test the change before merging without it touching his main working tree or any other worker branch's worktree. See `infrastructure/scripts/worker-test.sh`.
- Comment on the board card with a pre-filled GitHub PR URL instead of the plain link git prints — construct:
  `https://github.com/lukasz512/NeoSleep/compare/dev...worker/<...>?quick_pull=1&title=<url-encoded-title>&body=<url-encoded-body>`
  `title` is the ticket title (or a short summary); `body` is a short one/two-line summary of the change, plus — only when screenshots were produced — two markdown image lines pointing at the `raw.githubusercontent.com` URLs for `before.png`/`after.png` on the pushed branch, so they render inline the moment the PR form opens. Both `title` and `body` must be percent-encoded (spaces, `%0A` for newlines, and markdown's `! [ ] ( )` all need encoding). This still only pre-fills GitHub's own "new PR" form — Łukasz clicks "Create" himself, same as always; it does not open a pull request on your behalf.
- **If Step 6.5's double-implementation pass ran**, include both attempts' one-paragraph summaries and the stated rationale for the winner in this same completion comment.
- **Wait for CI before handing over** (NEO-182, `.claude/ci-autofix.json` `waitForGreenBeforePrLink`): the push starts CI on `worker/*`. Wait for it (`node infrastructure/scripts/ci-wait.mjs --max-minutes 30` — one call a minute; never `gh run watch`, CORE-128). Green → go on. Red → fix it here once in CI-fix mode steps 4–6 (it counts toward `maxFixAttempts`), and if it's still red, leave the rest to the GitHub handoff: say so in the completion comment instead of presenting the PR link as ready.
- Move the ticket to `Needs Review`.

