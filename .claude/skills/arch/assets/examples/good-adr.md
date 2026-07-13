# Example: Well-Written ADR

> Copy structure, fill content. Every ADR answers: What changed? Why? What did we close off?

---

# ADR-009: API Versioning and Breaking Change Policy

**Status**: Accepted | **Date**: 2026-03-22 | **Author**: Łukasz (Architect)

## Context

Two tenants now share the same API (neosleep_pl + neosleep_mx). A breaking change in any endpoint has simultaneous blast radius across both clients. We have no policy for what "breaking" means, how long deprecated endpoints live, or who approves a change. This is a SOC 2 CC8.1 gap and a FHIR conformance requirement.

## Decision

**Breaking vs. non-breaking:**

| Non-breaking (safe) | Breaking (requires ADR + window) |
|---|---|
| New optional fields in response | Removing or renaming any field |
| New optional query params | Changing a field's type |
| New endpoints | Changing HTTP method or auth requirement |
| Reduced error verbosity | Removing an endpoint |

**Versioning**: URL-prefix — `/api/v1/`, `/api/v2/`. Current routes are implicitly `v1`.
Header-based and query-param versioning rejected: harder to test, less visible in logs.

**Deprecation windows:**

| Change type | Minimum window |
|---|---|
| Field / endpoint removal | 90 days |
| Auth change | 30 days + personal Telegram to Alfred |
| Semantic breaking change | 90 days |

During window: serve old behavior + `Deprecation: true` + `Sunset: <date>` headers (RFC 8594).

**Breaking change gate** — nothing ships without:
1. ADR created and reviewed
2. Entry in `docs/API_CONTRACT.md` changelog
3. Alfred notified via Telegram 30+ days ahead
4. Rollback / feature flag available without re-deploy

**FHIR routes** (`/api/fhir/*`) follow FHIR R4 version negotiation — exempt from URL-prefix versioning.

## Consequences

✅ Safe parallel deployment across tenants — SOC 2 CC8.1 covered
✅ Clear path toward Veeva/IQVIA integration (they require stable versioned contracts)
❌ Existing `/api/` routes need auditing into `API_CONTRACT.md` (tracked, not a blocker)
❌ No automated breaking change detection yet — manual review until `openapi-diff` added to CI

## Compliance Impact

| Standard | Impact |
|---|---|
| GDPR Art.25 | Stable contracts prevent accidental data exposure during transitions |
| HIPAA §164.312(b) | Deprecation headers + ADR trail satisfy audit control requirement |
| SOC 2 CC8.1 | Formal gate closes the gap identified in pre-SOC2 review |
