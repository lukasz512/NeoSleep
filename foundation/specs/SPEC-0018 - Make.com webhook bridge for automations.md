    # SPEC-0018: Make.com webhook bridge for automations

    Status: Draft  
    Owner: Neo Sleep Care  
    Milestone: MVP  
    Apps/Modules: bff

    ## 1) Goal
    Standardize Make.com webhook calls from BFF (PCF submit, translation PR, monthly insights).

    ## 2) User story
    As ops, I want reliable automation triggers without exposing Make URLs to clients.

    ## 3) UX flow
    - N/A (backend integration)

    ## 4) Data & API
    BFF internal service: `POST makeWebhook(name, payload)`.
Env: MAKE_WEBHOOK_BASE + per-hook path keys.

    ## 5) Events & analytics
    - `bff_make_webhook_sent` (internal metric)
- `bff_make_webhook_failed`

    ## 6) Edge cases
    - Make timeout
- Retries
- Payload size

    ## 7) Acceptance criteria
    - Central wrapper with retries
- Per-tenant enable/disable
- Secrets only in BFF

    ## 8) Test plan
    - Unit: retry/backoff
- Integration: mocked HTTP client

    ## 9) Documentation updates
    - Update `ARCHITECTURE_BIBLE.md` integrations

    Date: 2026-02-18
