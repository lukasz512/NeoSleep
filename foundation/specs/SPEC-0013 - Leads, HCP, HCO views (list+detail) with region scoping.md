    # SPEC-0013: Leads/HCP/HCO views (list+detail) with region scoping

    Status: Draft  
    Owner: Neo Sleep Care  
    Milestone: MVP  
    Apps/Modules: rep,bff

    ## 1) Goal
    Provide core CRM views in Rep app with search, filtering, and region-scoped access via BFF.

    ## 2) User story
    As a rep, I want to browse my leads and related HCP/HCO records quickly and reliably.

    ## 3) UX flow
    - Tabs: Leads / HCP / HCO
- List with search
- Detail view with key info + actions
- Show loading/empty/error states

    ## 4) Data & API
    BFF:
- `GET /api/leads?query=&region=`
- `GET /api/leads/:id`
- `GET /api/hcp?query=`
- `GET /api/hco?query=`
Enforce region server-side.

    ## 5) Events & analytics
    - `rep_lead_opened` { id }
- `rep_hcp_opened` { id }
- `rep_hco_opened` { id }

    ## 6) Edge cases
    - Notion slow
- Offline (show cached subset if available)
- Missing relations

    ## 7) Acceptance criteria
    - Lists render within acceptable time
- Search works
- Unauthorized records not visible
- Errors shown with retry

    ## 8) Test plan
    - Unit: list filtering
- Component: empty/error
- E2E: login -> open lead detail

    ## 9) Documentation updates
    - Update module docs
- Update data model notes

    Date: 2026-02-18
