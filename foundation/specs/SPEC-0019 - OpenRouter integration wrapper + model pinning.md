    # SPEC-0019: OpenRouter integration wrapper + model pinning

    Status: Draft  
    Owner: Neo Sleep Care  
    Milestone: MVP  
    Apps/Modules: bff

    ## 1) Goal
    Provide a single wrapper for OpenRouter with per-tenant model pinning and safety policies.

    ## 2) User story
    As the product, I want consistent AI behavior with versioned prompts and controlled models.

    ## 3) UX flow
    - N/A (backend)

    ## 4) Data & API
    BFF service `aiCall(feature, input)`:
- loads prompt+model from tenant-config
- calls OpenRouter
- returns structured JSON schema

    ## 5) Events & analytics
    - `bff_ai_call` { feature, model, promptVersion }

    ## 6) Edge cases
    - Model unavailable
- Timeout
- Rate limits

    ## 7) Acceptance criteria
    - Model and prompt version included in response metadata
- Errors handled gracefully
- No sensitive content logged

    ## 8) Test plan
    - Unit: config resolution
- Contract: response schema validation
- Mock OpenRouter

    ## 9) Documentation updates
    - Update AI strategy + prompt registry docs

    Date: 2026-02-18
