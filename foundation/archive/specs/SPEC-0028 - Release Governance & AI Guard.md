# SPEC-0028: Release Governance & AI Guard

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: repo  
Milestone: Phase 2

## 1) Goal
Prevent AI and PRs from breaking architecture rules.

## 2) User story
As the team, we want CI to enforce architecture guards so that no secrets leak, no direct Notion in apps, and i18n is respected.

## 3) Requirements
CI checks:
- No secrets in frontend
- No direct Notion calls in apps
- All UI strings in i18n
- Failing PR blocks merge

## 4) Acceptance criteria
- Each check implemented in CI
- Failing PR blocks merge

## 5) Test plan
- CI job runs on PR
- Positive tests: valid code passes
- Negative tests: violations fail the job

## 6) Documentation updates
- CONTRIBUTING.md / PR checklist
- AI_PLAYBOOK reference to SPEC-0028

Date: 2026-02-18
