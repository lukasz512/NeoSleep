# SPEC-0021: Admin Panel – Tenant Config Editor

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: admin, bff  
Milestone: Phase 2

## 1) Goal
Allow admin to edit tenant configuration (branding, locale, feature flags, AI models) without code changes.

## 2) User story
As an admin, I want to configure branding and features without code changes.

## 3) UX flow
- Admin logs in
- Selects tenant
- Edits: Logo, Colors, Default language, Enabled features, AI model version
- Save → version increment

## 4) Data & API
- GET /api/admin/tenant/:id
- PATCH /api/admin/tenant/:id

## 5) Acceptance criteria
- Config versioning enabled
- Rollback possible
- Changes visible in rep app after refresh

## 6) Test plan
- Config validation (Zod)
- Version bump test
- E2E: change color → rep sees update

## 7) Documentation updates
- Admin module docs
- Tenant config schema

Date: 2026-02-18
