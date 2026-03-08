# SPEC-0025: HCP Portal – Document Access

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: client, bff  
Milestone: Phase 2

## 1) Goal
Allow HCP to view presentations shown to them, signed agreements, and marketing consents.

## 2) User story
As an HCP, I want to see documents that were shared with me so that I can review or download them.

## 3) UX flow
- HCP logged in (magic link, SPEC-0024)
- Sees list: presentations, agreements, consents
- View / download PDF

## 4) Data & API
- Endpoints scoped to current HCP (session)
- Access logged

## 5) Acceptance criteria
- HCP sees only own documents
- Access logged
- Downloadable PDF

## 6) Test plan
- RBAC: no access to other HCPs’ documents
- E2E: list + download flow
- Audit log for document access

## 7) Documentation updates
- HCP portal module
- Event taxonomy (document_access)

Date: 2026-02-18
