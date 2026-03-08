# SPEC-0026: Consent Management Module

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: client, admin, bff  
Milestone: Phase 2

## 1) Goal
Store and manage marketing consent per HCP.

## 2) User story
As compliance/admin, I want to track and revoke consent so that we respect HCP preferences and regulations.

## 3) Requirements
- Consent type
- Timestamp
- Version
- Revocation support

## 4) Data & API
- Consent stored per HCP
- History immutable
- Revocation disables outbound marketing

## 5) Acceptance criteria
- Revocation disables outbound marketing
- Consent history immutable

## 6) Test plan
- Unit: consent state transitions
- Integration: revocation applied to marketing flows
- Immutability of history records

## 7) Documentation updates
- Consent data model
- Admin/portal consent UI

Date: 2026-02-18
