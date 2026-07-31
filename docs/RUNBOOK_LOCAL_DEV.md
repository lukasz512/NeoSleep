# Local dev runbook

## Quick start (one command)

```bash
# Prerequisites: Docker Desktop installed, Node 20+
pnpm start
```

Starts Docker Desktop (if not running), then Postgres, runs migrations, installs deps, and launches API + PWA + WEB. See [README.md](../README.md) for details.

## Prereqs
- **Node 20+** (required for Vite 7, Vitest 4, ESLint 9; project has `.nvmrc` with `20`)
- **pnpm 9+**

**Using Node 20 in this project:**
- Before first install or running dev/tests: `nvm use` (uses `.nvmrc`)
- Or manually: `nvm use 20`
- If you don't have Node 20: install via [nodejs.org](https://nodejs.org/) (LTS 20 or 22) or `nvm install 20`

**Auto-switching to Node from `.nvmrc` when entering the directory (optional):**  
Add to `~/.zshrc` (for zsh):

```bash
# auto nvm use when entering directory with .nvmrc
autoload -U add-zsh-hook
load-nvmrc() {
  if [[ -f .nvmrc && -r .nvmrc ]]; then
    nvm use
  fi
}
add-zsh-hook chpwd load-nvmrc
load-nvmrc
```

After that, every `cd` into a directory with `.nvmrc` will set the correct Node version.

## Install (once, from project root)
```bash
nvm use
pnpm install
```

## Troubleshooting tests

**"crypto.getRandomValues is not a function" or "You installed esbuild for another platform"**  
- You are likely on **Node 16** or wrong architecture. Use **Node 20+** and reinstall:
  ```bash
  nvm use
  rm -rf node_modules
  pnpm install
  pnpm --filter @neo/pwa test -- --run
  ```

**"Cannot find module @rollup/rollup-darwin-arm64" (or @esbuild/darwin-arm64)**  
- Optional native deps were not installed for your OS/arch. From project root:
  ```bash
  rm -rf node_modules
  pnpm install
  ```
  Use a terminal where Node is running **natively** (e.g. arm64 on Apple Silicon), not under Rosetta.

**Running tests for PWA only:**
```bash
nvm use
pnpm --filter @neo/pwa test -- --run
```

## Tests (across the monorepo)

**One command from root – tests in every workspace:**
```bash
pnpm ci      # lint + typecheck + test, across all workspaces
```

- **Auto on commit:** the Husky pre-commit hook runs lint + typecheck + test before every `git commit`. If tests fail, the commit is blocked.
- The hook is installed automatically after `pnpm install` (the `prepare` script).
- CI on GitHub runs the same full `pnpm ci` gate on push/PR.

**Tests in one workspace only:**
```bash
pnpm --filter @neo/pwa test
pnpm --filter @neo/api test
```

## Start apps

**All at once, no Docker:**
```bash
pnpm dev   # API + PWA + WEB concurrently
```

**One app only:**
```bash
pnpm --filter @neo/pwa dev   # PWA
pnpm --filter @neo/web dev   # WEB
pnpm --filter @neo/api dev   # API
```

**Or from inside the app's directory:**
```bash
cd apps/pwa
pnpm dev
```

## Health check
```bash
curl http://localhost:3000/health
```

## App routes (scaffold)
- **PWA**: `/login`, `/dashboard` (default). Mobile-first sidebar nav (see `apps/pwa/src/router/routes.ts` for the current nav/role config).
- **WEB**: `/`, `/about`
