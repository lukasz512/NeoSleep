# Dependencies and lockfile

**Goal:** One lockfile as the single source of truth for all workspaces. No commit with changed `package.json` without an updated lockfile.

## Single lockfile

- The repo uses **pnpm workspaces** (see root [package.json](../../package.json)): `apps/*`, `packages/*`, `services/*`.
- There is **one lockfile**: `pnpm-lock.yaml` at the repo root.
- Everyone must run **`pnpm install`** at the **repo root** (not inside individual apps). That installs dependencies for all workspaces and keeps the lockfile in sync with all `package.json` files.

## Rule: commit lockfile with package changes

- **Do not** commit changes to any `package.json` (root or workspace) without:
  1. Running `pnpm install` at the repo root.
  2. Committing the updated `pnpm-lock.yaml` in the same commit (or a follow-up commit).

If you add a dependency, remove one, or change a version in any `package.json`, run `pnpm install` and commit the resulting lockfile. Otherwise other developers and CI will get out-of-sync dependency trees.

## Optional enforcement: lockfile check

To enforce that the lockfile is in sync before every commit:

1. **Script:** Run `pnpm run lockfile:check` at the repo root. This script:
   - Runs `pnpm install` (so the lockfile reflects current `package.json` state).
   - Then checks whether `pnpm-lock.yaml` has uncommitted changes (`git diff --exit-code pnpm-lock.yaml`).
   - If the lockfile is dirty, it exits with code 1 and prints a message: run `pnpm install` and commit the updated `pnpm-lock.yaml`.

2. **Pre-commit hook:** The Husky pre-commit hook (see [.husky/pre-commit](../../.husky/pre-commit)) can run `pnpm run lockfile:check` before `npm test`. If the lockfile is out of sync, the commit is rejected. This makes it effectively impossible to commit without having run install and included the lockfile update.

## CI

- CI (see [.github/workflows/ci.yml](../../.github/workflows/ci.yml)) runs **`pnpm install --frozen-lockfile`**.
- With `--frozen-lockfile`, pnpm will fail if `package.json` and `pnpm-lock.yaml` are out of sync (e.g. someone changed a dependency but did not run `pnpm install` or did not commit the lockfile).
- So CI already blocks merging when the lockfile is inconsistent; the pre-commit check adds an earlier, local guard.

## Summary

| What | Action |
|------|--------|
| After changing any `package.json` | Run `pnpm install` at root and commit `pnpm-lock.yaml`. |
| Before committing (optional) | Pre-commit runs `lockfile:check`; commit fails if lockfile is dirty. |
| In CI | `pnpm install --frozen-lockfile` fails if lockfile and package.json disagree. |

## Renovate (auto-updates)

The repo uses [Renovate](https://docs.renovatebot.com/) (e.g. as a GitHub App) to open PRs that bump dependencies. Config: [renovate.json](../../renovate.json) at repo root.

- **Schedule:** Mondays before 7:00 (Europe/Dublin).
- **Minor/patch:** Automerge enabled (single PR per update type).
- **Major:** No automerge; PRs get label `major` for manual review.
- **Dependency Dashboard:** Renovate opens a single issue listing available updates; you can trigger runs from there.
- **Shared versions:** With [pnpm catalogs](https://pnpm.io/catalogs) in `pnpm-workspace.yaml`, Renovate PRs that bump the catalog update all apps using `catalog:` in one go.
