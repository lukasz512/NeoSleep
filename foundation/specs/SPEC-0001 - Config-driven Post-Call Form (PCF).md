# SPEC-0001: Config-driven Post-Call Form (PCF)

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: rep, bff, config  
Milestone: MVP

## 1) Goal
Allow reps to submit a post-call report with minimal friction, configurable per tenant, and safe offline.

## 2) User story
As a rep, I want to fill a post-call form after a meeting, so that HQ can track outcomes and next steps.

## 3) UX flow
1. Rep opens a Lead/HCP and taps "Start meeting"
2. Meeting context is captured (who/where/what content)
3. Rep opens PCF (fields generated from tenant-config)
4. Rep submits; if offline -> queued; if online -> sent
5. Rep sees confirmation + pending sync indicator if needed

## 4) Screens
- Meeting start/stop
- PCF form (loading, validation errors, offline pending)
- Sync queue (optional v1)

## 5) Data & API
Entities: Meeting, PCFSubmission  
Endpoints (BFF):
- POST /meetings
- PATCH /meetings/:id/stop
- POST /pcf-submissions
Offline:
- Queue PCFSubmission in IndexedDB
- Retry on reconnect

## 6) Events
- meeting_started
- meeting_stopped
- pcf_opened
- pcf_submitted
- pcf_queued_offline
- pcf_synced

## 7) Acceptance criteria
- Fields come from config with validations
- Works with 30 min offline (queue + retry)
- Server enforces RBAC/region

## 8) Test plan
- Unit: config -> field rendering, validations
- Component: form states/offline indicator
- E2E: offline submit then reconnect sync
- Contract: BFF endpoints validate payload

## 9) Docs updates
- Module docs: rep/pcf, services/bff/pcf
- ADR if schema changes
