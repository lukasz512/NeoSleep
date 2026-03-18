    # SPEC-0014: Google Maps deep link (native navigation)

    Status: Draft  
    Owner: Neo Sleep Care  
    Milestone: MVP  
    Apps/Modules: rep

    ## 1) Goal
    Open native navigation (Google Maps / Apple Maps) from HCO/HCP address with one tap.

    ## 2) User story
    As a rep, I want to start navigation to a clinic quickly.

    ## 3) UX flow
    - Address card has 'Navigate' action
- On iOS: prefer Apple Maps fallback
- On Android: prefer Google Maps
- If neither, open web maps

    ## 4) Data & API
    No new API. Uses data fields: address, lat/lng if present.

    ## 5) Events & analytics
    - `rep_navigate_clicked` { entityType, entityId }

    ## 6) Edge cases
    - Missing address
- Invalid characters
- No maps app installed

    ## 7) Acceptance criteria
    - Correct deep link
- Graceful fallback
- Disabled if no address

    ## 8) Test plan
    - Unit: link builder
- E2E: click navigate opens correct URL (assert window.location)

    ## 9) Documentation updates
    - Add to rep module docs

    Date: 2026-02-18
