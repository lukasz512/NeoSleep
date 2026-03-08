# Local dev runbook

## Quick start (one command)

```bash
# Prerequisites: Docker Desktop installed, Node 20+
npm run start
```

Starts Docker Desktop (if not running), then Postgres/Adminer/Directus, runs migrations, installs deps, and launches BFF + rep-app. See [README.md](../README.md) for details.

## Prereqs
- **Node 20+** (required for Vite 7, Vitest 4, ESLint 9; project has `.nvmrc` with `20`)
- **npm** (bundled with Node) or pnpm 9+

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
npm install
```

## Troubleshooting tests

**"crypto.getRandomValues is not a function" or "You installed esbuild for another platform"**  
- You are likely on **Node 16** or wrong architecture. Use **Node 20+** and reinstall:
  ```bash
  nvm use
  rm -rf node_modules
  npm install
  cd apps/rep-app && npm run test -- --run
  ```

**"Cannot find module @rollup/rollup-darwin-arm64" (or @esbuild/darwin-arm64)**  
- Optional native deps were not installed for your OS/arch. From project root:
  ```bash
  rm -rf node_modules
  npm install
  ```
  Use a terminal where Node is running **natively** (e.g. arm64 on Apple Silicon), not under Rosetta.

**Running tests for rep-app only:**
```bash
nvm use
cd apps/rep-app && npm run test -- --run
```

## Testy (w core projektu)

**Jedna komenda z roota – testy we wszystkich workspace’ach (apps + services):**
```bash
npm test
```

- Uruchamia `npm run test` w każdym workspace (admin, rep-app, portal, website, bff).
- **Auto przy commicie:** hook **Husky** (pre-commit) uruchamia `npm test` przed każdym `git commit`. Jeśli testy się nie przejdą, commit się nie wykona.
- Po `npm install` hook jest ustawiany automatycznie (skrypt `prepare`).
- CI na GitHubie i tak uruchamia pełne `ci` (lint + typecheck + test) przy pushu/PR.

**Testy tylko w jednym workspace:**
```bash
cd apps/rep-app && npm run test
# albo z roota:
npm run test --workspace=@neo/rep-app
```

## Start apps

**Z npm (z roota):**
- Rep app: `npm run dev --workspace=@neo/rep-app`
- Admin: `npm run dev --workspace=@neo/admin`
- Portal: `npm run dev --workspace=@neo/portal`
- Website: `npm run dev --workspace=@neo/website`

**Albo wejdź do katalogu appki i uruchom tam:**
```bash
cd apps/rep-app
npm run dev
```

**Z pnpm (jeśli masz):**
- Rep app: `pnpm -C apps/rep-app dev`
- Admin: `pnpm -C apps/admin dev`
- itd.

## Start BFF
- npm: `npm run dev --workspace=@neo/bff` albo `cd services/bff && npm run dev`
- pnpm: `pnpm -C services/bff dev`

## Health check
curl http://localhost:3000/health

## App routes (scaffold)
- **Admin**: `/login`, `/dashboard` (default)
- **Rep app**: `/login`, `/dashboard` (default). **Mobile first** (SPEC-0042): sidebar w stylu iOS/Finder (ikony + tekst, nagłówek „Moduły”, zaokrąglone rogi), zwijany, **toggle na dole**; moduły: Dashboard, Contacts, Accounts, Planner. Po **prawej**: awatar + imię i nazwisko; klik → menu (motyw, język). Po zmianie języka menu zamyka się (kluczowa funkcjonalność).
- **Portal**: `/login`, `/dashboard` (default)
- **Website**: `/`, `/about`
