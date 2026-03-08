# ADR-0001: Use BFF as the integration boundary

Date: 2026-02-18
Status: Accepted
Owners: Neo Sleep Care

## Context
We need a Rep PWA with offline features, a future Admin, and a future HCP/patient portal.
We also need to integrate Notion, OpenRouter, Make.com, email provider, and logging—without exposing secrets to clients.

## Decision
Introduce a **Backend For Frontend (BFF)** service as the single boundary for all frontends:
- Frontends talk only to BFF.
- BFF owns all secrets and external integrations.
- BFF enforces auth, RBAC/regions, and redaction.

## Alternatives considered
- Direct frontend -> Notion/OpenRouter (rejected: secrets, rate limits, security)
- Separate service per integration (rejected for v1: too much overhead)

## Consequences
+ Strong security boundary and stable API for frontends.
+ Easier to swap Notion -> DB later.
- Requires hosting and operations for BFF.
