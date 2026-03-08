# SPEC-0037: OpenAPI Contract Generation

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: bff  
Milestone: Phase 2

## 1) Goal
Generate API contract automatically so that frontend and partners can rely on a single source of truth.

## 2) Requirements
- OpenAPI schema generated from routes
- Swagger UI (dev only)
- Contract tests

## 3) DoD
- /api/docs available in dev
- Schema versioned

## 4) Test plan
- Contract tests: responses match OpenAPI schema
- CI: schema generated on build

## 5) Documentation updates
- API_CONTRACT (reference to OpenAPI)
- RUNBOOK_LOCAL_DEV (/api/docs)

Date: 2026-02-18
