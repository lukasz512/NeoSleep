# Module: BFF Service

Type: Service  
Depends on: Notion API, OpenRouter, Make webhooks, Email provider

## Purpose
Single integration boundary for all frontends. Owns secrets, auth, RBAC, caching, redaction, and audit logging.

## Public interfaces
- REST endpoints grouped by domain: auth, leads, hcp/hco, meetings, pcf, content, events, ai

## Configuration
- Env vars: NOTION_TOKEN, OPENROUTER_KEY, EMAIL_API_KEY, SENTRY_DSN, etc.
- tenant-config fetched per tenant (cached)

## Testing
- Unit: domain logic
- Contract tests: endpoint validation
- Integration: Notion adapter mocked

## Security
- Enforces RBAC + region scoping
- Redacts sensitive fields in logs
