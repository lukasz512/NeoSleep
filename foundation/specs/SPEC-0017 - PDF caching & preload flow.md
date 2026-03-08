    # SPEC-0017: PDF caching & preload flow

    Status: Draft  
    Owner: Neo Sleep Care  
    Milestone: MVP  
    Apps/Modules: rep

    ## 1) Goal
    Allow reps to preload a presentation PDF before a meeting for offline use.

    ## 2) User story
    As a rep, I want to ensure the deck is available offline before entering the clinic.

    ## 3) UX flow
    - Content list shows 'Available offline' toggle per PDF
- 'Download' progress
- 'Remove offline' action

    ## 4) Data & API
    BFF serves PDFs with cache headers.
Rep uses Service Worker cache API.

    ## 5) Events & analytics
    - `rep_pdf_preload_started`
- `rep_pdf_preload_completed`
- `rep_pdf_preload_failed`

    ## 6) Edge cases
    - Low storage
- Interrupted download
- Version change invalidates cache

    ## 7) Acceptance criteria
    - PDFs can be downloaded and opened offline
- Clear status per file
- Cache invalidation on version bump

    ## 8) Test plan
    - Unit: cache key builder
- E2E: preload -> offline -> open

    ## 9) Documentation updates
    - Update offline strategy doc

    Date: 2026-02-18
