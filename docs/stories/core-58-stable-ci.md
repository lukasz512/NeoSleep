# CORE-58 — Stable CI

Status: plan, waiting for Łukasz's decisions (Artifact linked from CORE-58).

## Evidence (last 100 CI runs, 2026-09-28)

86 green, 12 red. The last 3 pushes to `dev` are red. Red runs by cause:

| Cause | Where | Seen | Error |
|---|---|---|---|
| Layout measured mid-animation | `dialog-header.spec.ts:110` confirm dialog, WebKit (once Firefox :74) | 5× | "card top → headline: got -38.9px, want 24px" |
| Popover not on top yet | `date-field.spec.ts:55` phone calendar, WebKit | 3× | `paintsOnTop` false |
| Content not rendered yet | `partner-registration-scroll.spec.ts:72`, WebKit | 4× | scrollHeight 640 = clientHeight 640 |
| Slow navigation | `auth.spec.ts:58` bfcache, WebKit | 4× | `page.goto` 30 s timeout |
| Real bugs on feature branches (fixed before merge) | breadcrumbs, form-errors | 4 runs | — |
| Lockfile out of sync in Docker build | one branch, api-image | 1× | `pnpm install --frozen-lockfile` |

All e2e flakes fail **both** attempts (`retries: 1`), so a retry does not hide them. They wait for "no running animation", but that check passes before a transition has started, and WebKit on the Linux runner is slower. The e2e servers run Vite in dev mode, which compiles each module on first request.

Also:
- 4 API tests fail intermittently under the parallel run (CORE-35: shared rate-limit bucket, shared test rows).
- PWA and web unit tests are green today but run with `continue-on-error`, so a regression there never blocks a merge.
- Only the `test` job is a required check; `tooling` and `api-image` are not.

## Plan

1. **Reproduce first (TDD).** CI job `e2e-flake-hunt` (manual + nightly): the 5 specs with `--repeat-each=20` on all 3 engines. Record the failure rate before any fix.
2. **One `settle()` for layout specs** (`e2e/support/settle.ts`): fonts loaded, pending *and* running finite animations done, the measured element's box unchanged across 3 animation frames. Layout assertions become `expect.poll`, not one-shot reads. Replace the 7 hand-rolled waits.
3. **No motion in layout specs:** Playwright `reducedMotion: "reduce"`, and the PWA honours `prefers-reduced-motion` in one place (global CSS token), not per component.
4. **Faster, prod-like servers:** e2e against `vite build` + `vite preview` (same proxy), not the dev server. Also catches minifier-only bugs (NEO-103).
5. **Auth bfcache (WebKit):** wait for `load` + the session probe instead of a fixed goto; keep the behaviour under test.
6. **API flakes (CORE-35):** rate limiter keyed per test worker, unique rows per test file, no shared tenant state.
7. **Make it blocking:** drop `continue-on-error` for PWA/web unit tests; add `tooling` and `api-image` as required checks on `dev`.
8. **Keep it stable:** job summary lists every test that needed a retry ("flaky"), so a new flake is visible the day it appears.

## Done when

- The 5 specs pass 20× in a row on chromium, firefox and webkit (flake-hunt job).
- CORE-35's 4 API tests pass 20× under the full parallel run.
- 10 consecutive green CI runs on `dev`.
- PWA/web unit tests, `tooling` and `api-image` block merges.
