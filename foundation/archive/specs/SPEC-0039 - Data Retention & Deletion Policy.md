# SPEC-0039: Data Retention & Deletion Policy

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: bff  
Milestone: Phase 2

## 1) Goal
Prepare for future EU compliance (e.g. GDPR) with clear retention and deletion behavior.

## 2) Requirements
- Soft delete strategy
- Hard delete workflow
- Retention period config
- Consent revocation effect

## 3) DoD
- Delete endpoint respects policy
- Retention documented

## 4) Test plan
- Unit: soft delete does not expose in list
- Integration: hard delete after retention
- Consent revocation triggers deletion where required

## 5) Documentation updates
- Data retention policy doc
- API behavior for delete endpoints

Date: 2026-02-18
