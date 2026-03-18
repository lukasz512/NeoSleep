# SPEC-0008: Event Logging + Observability

Status: Draft
Apps/Modules: rep, bff
Milestone: MVP

## Goal
Have audit trail + error monitoring.

## Requirements
- POST /api/events (batch)
- Redact sensitive fields
- Integrate Sentry (frontend + BFF)
- Attach release version

## Tests
- Validate event schema
- Ensure redaction