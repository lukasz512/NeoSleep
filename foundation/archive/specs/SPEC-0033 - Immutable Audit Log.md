# SPEC-0033: Immutable Audit Log

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: bff  
Milestone: Phase 2

## 1) Goal
Record critical system actions immutably for compliance and forensics.

## 2) Logged actions
- Admin config changes
- Consent updates
- Role changes
- Feature flag toggles

## 3) Rules
- Append-only
- No update/delete
- Separate from UX events (EVENT_TAXONOMY)

## 4) DoD
- /api/audit internal write endpoint
- Audit schema defined
- Admin actions recorded

## 5) Test plan
- Unit: audit write appends only
- Integration: admin action produces audit entry
- No delete/update on audit store

## 6) Documentation updates
- Audit log schema
- SECURITY_MODEL / compliance section

Date: 2026-02-18
