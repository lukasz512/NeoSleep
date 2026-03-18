# SPEC-0023: Feature Flags Engine

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: bff, rep  
Milestone: Phase 2

## 1) Goal
Enable per-tenant feature toggling.

## 2) User story
As an admin, I want to enable/disable features per tenant so that we can roll out or roll back without code deploy.

## 3) Requirements
Feature flags: aiCopilot, pdfTracking, offlineMode, advancedAnalytics.

## 4) Data & API
- Flags resolved in BFF from tenant-config
- Rep app receives flags via session or config endpoint (no override from frontend)

## 5) Acceptance criteria
- Flags resolved in BFF
- Rep cannot bypass via frontend
- Feature toggle visible in admin

## 6) Test plan
- Unit: flag resolution from tenant config
- E2E: disabled feature not visible in rep app
- Security: frontend cannot override flags

## 7) Documentation updates
- Tenant config schema (feature flags)
- Admin panel (SPEC-0021) – flag UI

Date: 2026-02-18
