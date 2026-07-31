# Neo Sleep Care Platform

pnpm monorepo: 2 Vue 3 + Vite apps + 1 Express API server + PostgreSQL (Supabase for MVP). See [CLAUDE.md](CLAUDE.md) for the full project brief and architecture rules.

## Getting Started

**Prerequisites:** Docker Desktop installed, Node 20+

```bash
pnpm start
```

One command starts everything:
- Docker Desktop (if not running – launches it and waits)
- Postgres
- DB migrations
- API server + rep app + website

- **Rep app (PWA):** http://localhost:5173
- **API server:** http://localhost:3000
- **Website:** http://localhost:5174

## Tests

```bash
pnpm ci      # lint + typecheck + test, across all workspaces
```

Tests run automatically on pre-commit (Husky).

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/REPO_CONVENTIONS.md](docs/REPO_CONVENTIONS.md) | Repo/naming conventions |
| [docs/RUNBOOK_LOCAL_DEV.md](docs/RUNBOOK_LOCAL_DEV.md) | Local dev runbook, troubleshooting |
| [docs/](docs/) | ADRs, API contract, security model, lessons learned |
| [docs/foundation/](docs/foundation/) | Feature backlog, design/UI reference |

## Apps (monorepo)

| App | Path | Subdomain (target) |
|-----|------|--------------------|
| Rep PWA | `apps/pwa` | pwa.neosleepcare.com |
| Website | `apps/web` | neosleepcare.com |
| API server | `apps/api` | api.neosleepcare.com (planned — currently Render-assigned URL, see `render.yaml`) |
| Telegram bot | `apps/telegram` | — |

## Local dev (manual)

- **Node 20:** `nvm use` (uses `.nvmrc`)
- **Everything (no Docker):** `pnpm dev` (api, pwa, web concurrently)
- **One app only:** `pnpm --filter @neo/pwa dev` / `@neo/web dev` / `@neo/api dev`
- **DB seed:** `pnpm db:seed` (requires Docker up)
- **Health:** `curl http://localhost:3000/health`

## AI-assisted workflow

Write a SPEC → ask Claude Code to implement + add tests + update docs → merge via CI gates.
