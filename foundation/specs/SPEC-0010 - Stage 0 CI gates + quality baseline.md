    # SPEC-0010: Stage 0 CI gates + quality baseline

    Status: Draft  
    Owner: Neo Sleep Care  
    Milestone: MVP  
    Apps/Modules: repo

    ## 1) Goal
    Make CI enforce quality: typecheck, lint, tests, and required docs updates per PR.

    ## 2) User story
    As a maintainer, I want PRs to be blocked if quality gates fail, so the codebase stays reliable with AI-generated changes.

    ## 3) UX flow
    - N/A (developer workflow)

    ## 4) Data & API
    - N/A

    ## 5) Events & analytics
    - N/A

    ## 6) Edge cases
    - Missing tests
- Flaky tests
- Monorepo task failures

    ## 7) Acceptance criteria
    - CI runs on PR and main
- CI fails when unit tests missing/failing
- CI runs typecheck and lint
- PR template/checklist required
- `pnpm ci` passes locally and in CI

    ## 8) Test plan
    - Add a sample failing test to verify CI blocks
- Add a sample type error to verify typecheck blocks

    ## 9) Documentation updates
    - Update `/docs/REPO_CONVENTIONS.md`
- Ensure PR template references checklist

    Date: 2026-02-18
