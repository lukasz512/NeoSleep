# NEO-163 — Claude · Linear · GitHub: link contract, no orphans, leaner tickets

Status: decided 2026-09-28 (decision form `neo-163-linking-r1`); work split into NEO-164…171 (project P-NEO-5).

## Decisions (Łukasz, 2026-09-28)

| # | Question | Answer | Ticket |
|---|---|---|---|
| A1 | Claude link | VS Code link + Artifact with `claude --resume <id>` | NEO-164, NEO-165 |
| A2 | GitHub check | Blocks merge (required), Renovate exempt | NEO-164 |
| A3 | Linear API key for hooks | Yes, local only (`.claude/local/`) | NEO-166 |
| A4 | Orphan sweep | Label `orphan` + one Linear view, no messages | NEO-169 |
| B1 | Required fields | All 6: Type, Area, Market, Priority, Estimate, Project | NEO-167 |
| B2 | Raw ideas | Triage; Claude formats in English, original as first comment | NEO-168 |
| B3 | Artifact language | English everywhere; chat stays Polish | — |
| C1 | CORE/NEO split | Now, and migrate open platform tickets | NEO-171 |
| C2 | Accounts | Separate: Łukasz as a person, Claude/worker as app users | NEO-171 |

New client (same form): **AJ Management**, Linear key **AJM**, a neoCRM client.
Answered 2026-09-28: neoCRM is the platform, so its work lives in **CORE**; AJM is a client team. AJM, like 4Seasons, lives in **this repo**. Client teams hold only client-specific work (config, content, requests).

### Creating the teams (manual, Łukasz)

1. Linear → Settings → Teams → **Create team**. Name `CORE`, identifier `CORE`, "copy settings from" NeoSleep so statuses (Needs Review, Ready for Worker, Blocked) and labels match.
2. Repeat for `AJ Management` / `AJM`, and 4Seasons with its key.
3. In each new team's settings, turn on **Triage** (NEO-168).
4. Move open platform tickets: open the ticket → ⋯ → Move to team → CORE. The old NEO-n link keeps working.
5. Tell Claude the 4Seasons key; hooks and checks then accept `NEO|CORE|AJM|<key>-n`.

Change Index cost (found while shipping this ticket): NEO-170.

## Why

Three tools, one piece of work. Today you can get from the Artifact to Linear and GitHub,
but not back: PR bodies carry only the ticket ID and a summary, Linear has the Artifact
but not the session, and cloud-session branches (`claude/<random>`) carry no ticket ID.
Nothing detects orphans. The team is about to become international, so every ticket must
be readable by someone who was not in the conversation, in English, without filler.

## Audit (2026-09-28, NEO-1…162)

| Gap | Evidence |
|---|---|
| PR body has no Artifact / session link | `build.mjs prUrl()` writes only ticket + summary; PRs #309–#315 |
| 3 branch schemes | `worktree-neo-*`, `claude/<random>` (#308–#313), Linear's own `neosleepcare/neo-*` |
| Fields empty | 5 labels in the workspace; most tickets: no label, "No priority", no estimate, no project |
| Mixed languages | NEO-86 "Pwa", NEO-96 "Widok pacjenta", NEO-156 "widok entity - la portada", NEO-157 "personalizacja apki" |
| Raw ideas marked Ready for Worker | NEO-157 is Urgent + Ready for Worker with a 3-line PL brainstorm as the body |
| One shared account | every ticket is created by and assigned to "NeoSleep" — human, worker and Claude look identical |
| Link state is local | markers live in gitignored `.claude/local/artifacts/` on one laptop |
| Hook checks only new tickets' body | `pre-tool-linear-ticket-format.sh`: headings + 1500 chars; no fields, language, or slop check |

## Proposal

### 1. Link contract — 4 links, 3 places, same order

Links: **Linear · PR · Artifact · Claude session**. Every place shows all four.

| Place | How |
|---|---|
| Artifact | top bar (exists) — add Artifact self-link |
| GitHub PR | first line of the body: `NEO-123 · Artifact · Claude`; Linear comes from the integration |
| Linear ticket | attachments, not comments: Artifact, PR (integration), Claude session |
| Claude session | title `[NEO-123] …` (manual `/rename`); SessionStart prints the 4 links for the current branch |

Linear comments: one "Status" comment per ticket, edited in place (outcome · needs decision), never one per session.

### 2. No orphans — 3 layers

1. **Claude Code hooks (local)** — worktree/branch name must start with an existing ticket ID; Stop checks the ticket's attachments + status through the Linear API (needs a personal Linear API key in `.claude/local/`).
2. **GitHub check (server, catches everyone)** — `pr-links.yml`, required: branch or title has `NEO-<n>`, body has the link line. Covers cloud sessions and future teammates. Renovate exempt.
3. **Nightly orphan sweep** — label `orphan` + a Linear view: In Progress with no branch for 2 days, branch/PR without ticket, merged PR whose ticket is still In Progress, Needs Review with no Artifact.

### 3. Leaner tickets — fields over prose

- Required fields (hook on create and on move to In Progress / Ready for Worker): Type, Area, Market, Priority, Estimate, Project.
- Label groups: Type (Bug/Feature/Improvement/Chore/Spike), Area (PWA/API/Web/Infra/Docs/Tooling), Market (PL/MX/TH/All).
- Body: Problem ≤ 2 sentences · Change ≤ 5 bullets · Done when 1–6 checkboxes, ≤ 120 chars each · total ≤ 900 chars.
- Title: English, ≤ 70 chars, the outcome ("Doctor sees …"), not a feature list.
- Slop linter: rejects filler words (seamless, robust, comprehensive, leverage, ensure, enhance, streamline), emoji, non-English outside quotes/backticks.
- Raw ideas land in **Triage** in any language; Claude rewrites them in English and keeps the original as the first comment. Only a formatted ticket can reach Ready for Worker.
- Linear templates Bug / Feature / Chore / Spike, so people see the same shape Claude writes.

### 4. Clients

One workspace. Team **CORE** (platform engine, shared by all tenants) + one team per client (**NEO** today, e.g. **FS** later). Team key = ticket prefix = branch prefix. Client guests see only their team. Projects can span CORE + client.

### 5. International team

English everywhere in Linear, GitHub and Artifacts; chat with Łukasz stays Polish. Glossary (HCP, HCO, KAM …) as a Linear document linked from every team. Dates ISO, times UTC. One person = one account; Claude and the worker act under their own app identity.

## Rollout

1. Link contract + GitHub check + PR body line (`build.mjs`).
2. Label groups, templates, stricter ticket hook + slop linter.
3. Orphan sweep + clean the open backlog (rename the PL/ES titles, fill fields).
4. CORE/NEO split — now or when the second client signs (decision).
