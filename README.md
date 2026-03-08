# Neo Sleep Care Platform

This repo contains the platform code + the architecture/spec foundation.

## Getting Started

**Prerequisites:** Docker Desktop installed, Node 20+

```bash
npm run start
```

One command starts everything:
- Docker Desktop (if not running – launches it and waits)
- Postgres, Adminer, Directus
- DB migrations
- BFF + rep-app

- **Rep app:** http://localhost:5173
- **BFF API:** http://localhost:3000
- **Adminer (DB):** http://localhost:8080

## Tests

```bash
# All workspaces (rep-app, admin, portal, website, bff)
npm test

# Rep-app only
cd apps/rep-app && npm run test -- --run

# BFF only
cd services/bff && npm run test
```

Tests run automatically on pre-commit (Husky).

## Documentation

| Doc | Description |
|-----|-------------|
| [foundation/docs/ARCHITECTURE_BIBLE.md](foundation/docs/ARCHITECTURE_BIBLE.md) | Architecture overview |
| [docs/RUNBOOK_LOCAL_DEV.md](docs/RUNBOOK_LOCAL_DEV.md) | Local dev runbook, troubleshooting |
| [foundation/specs/](foundation/specs/) | Feature specs (SPEC-xxxx) |
| [foundation/adrs/](foundation/adrs/) | Architecture decisions |
| [foundation/modules/](foundation/modules/) | Module docs (rep-app, BFF, etc.) |
| [foundation/docs/DATABASE_MIGRATIONS.md](foundation/docs/DATABASE_MIGRATIONS.md) | DB migrations |

## Apps (monorepo)

| App | Path | Subdomain (target) |
|-----|------|--------------------|
| Rep PWA | `apps/rep-app` | app.neosleepcare.com |
| Admin | `apps/admin` | admin.neosleepcare.com |
| HCP Portal | `apps/portal` | client.neosleepcare.com |
| Website | `apps/website` | neosleepcare.com |

## Local dev (manual)

- **Node 20:** `nvm use` (uses `.nvmrc`)
- **Rep app:** `pnpm -C apps/rep-app dev` or `npm run dev --workspace=@neo/rep-app`
- **BFF:** `pnpm -C services/bff dev`
- **Apps without Docker:** `npm run dev` (BFF + rep-app; BFF uses mock data if Postgres unavailable)
- **DB seed:** `npm run db:seed` (requires Docker up)
- **Health:** `curl http://localhost:3000/health`

## AI-assisted workflow

Write a SPEC → ask Cursor to implement + add tests + update docs → merge via CI gates.
