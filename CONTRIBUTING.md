# Contributing (Neo Sleep Care)

We build **SPEC-first**.

## Workflow
1) Create/Update a SPEC in `/foundation/specs/` (use `SPEC_TEMPLATE.md`).
2) If the change affects architecture or cross-module behavior, add an ADR in `/foundation/adrs/`.
3) Implement via PR with:
   - tests (unit + e2e for user flows),
   - docs updates (SPEC + relevant module docs),
   - i18n keys if UI.
4) PR must satisfy `.github/PULL_REQUEST_TEMPLATE.md` and `foundation/docs/PR_CHECKLIST.md`.

## AI-assisted work (Cursor/Copilot)
- Provide the SPEC + target module doc to the AI.
- Ask for: implementation + tests + doc updates.
- Reject PRs that change architecture without an ADR.

## Coding standards
- TypeScript strict
- No secrets in frontend (only BFF reads secrets)
- Server-side RBAC/region enforcement

## Commit messages
- feat: ...
- fix: ...
- docs: ...
- chore: ...
