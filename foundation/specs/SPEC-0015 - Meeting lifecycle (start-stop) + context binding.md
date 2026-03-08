    # SPEC-0015: Meeting lifecycle (start/stop) + context binding

    Status: Draft  
    Owner: Neo Sleep Care  
    Milestone: MVP  
    Apps/Modules: rep,bff

    ## 1) Goal
    Create meeting records and capture context (lead/hcp/hco, time) as the backbone for PCF and tracking.

    ## 2) User story
    As a rep, I want to start a meeting tied to a customer and have the app collect context automatically.

    ## 3) UX flow
    - From Lead/HCP/HCO detail: 'Start meeting'
- Meeting banner shows active meeting
- 'Stop meeting' ends and opens PCF

    ## 4) Data & API
    BFF:
- `POST /api/meetings` { leadId?, hcpId?, hcoId? }
- `PATCH /api/meetings/:id/stop`
Return meetingId and timestamps.

    ## 5) Events & analytics
    - `rep_meeting_started`
- `rep_meeting_stopped`

    ## 6) Edge cases
    - App reload during meeting (restore state)
- Offline start (optional v1: allow local temp meetingId)
- Stop without start

    ## 7) Acceptance criteria
    - Meeting persisted
- Active meeting state restored after reload
- Stop produces duration

    ## 8) Test plan
    - Unit: meeting state store
- E2E: start -> stop -> PCF opened

    ## 9) Documentation updates
    - Update `SPEC-0001` references
- Update API contract

    Date: 2026-02-18
