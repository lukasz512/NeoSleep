# SPEC-0022: Dynamic Form Builder (PCF Builder)

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: admin, rep, bff  
Milestone: Phase 2

## 1) Goal
Allow admin to configure Post Call Form fields visually.

## 2) User story
As an admin, I want to define PCF fields without code so that reps see the right form per tenant.

## 3) Requirements
Field types: text, textarea, select, multiselect, checkbox, rating, date.

## 4) Data
Stored in tenant-config.

## 5) Acceptance criteria
- Form updates without redeploy
- Validation auto-applied
- Offline compatible

## 6) Test plan
- Config schema validation (Zod)
- Rep app renders dynamic form from config
- Offline submit queue respects field schema

## 7) Documentation updates
- PCF config schema
- Admin module (form builder UI)

Date: 2026-02-18
