    # SPEC-0016: Offline sync UI (queue + retry)

    Status: Draft  
    Owner: Neo Sleep Care  
    Milestone: MVP  
    Apps/Modules: rep

    ## 1) Goal
    Provide clear sync UI for offline-queued items: count, states, retry, last sync time.

    ## 2) User story
    As a rep, I want confidence that my offline work will sync and I can fix it if it fails.

    ## 3) UX flow
    - Header indicator: Online/Offline + pending count
- View: Sync Queue list with statuses
- Action: Retry failed, remove local draft (admin/advanced)

    ## 4) Data & API
    BFF endpoints already exist; rep will batch-send queued items on reconnect.

    ## 5) Events & analytics
    - `rep_sync_retry_clicked`
- `rep_sync_item_failed` (client-side log)


    ## 6) Edge cases
    - Conflicts
- Partial sync
- Repeated failures

    ## 7) Acceptance criteria
    - Queue visible and understandable
- Automatic retry
- Manual retry works
- No data loss on refresh

    ## 8) Test plan
    - E2E: offline -> create queued item -> online -> sync
- Unit: queue reducer

    ## 9) Documentation updates
    - Update offline section in module docs

    Date: 2026-02-18
