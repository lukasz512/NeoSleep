    # SPEC-0012: Design tokens + Vuetify theme adapter

    Status: Draft  
    Owner: Neo Sleep Care  
    Milestone: MVP  
    Apps/Modules: rep

    ## 1) Goal
    Apply tenant-config design tokens to Vuetify theme + CSS variables; support system theme + user override.

    ## 2) User story
    As a rep, I want the app to look branded and readable, with dark/light matching system unless I change it.

    ## 3) UX flow
    - On boot: load tenant tokens
- Default theme = system
- Settings: user can override theme (stored locally)
- Admin controls brand colors (tenant-config)

    ## 4) Data & API
    Rep reads tokens from `/api/tenant/config`.
No direct token editing in rep.

    ## 5) Events & analytics
    - `rep_theme_changed` { mode: system|light|dark }

    ## 6) Edge cases
    - Missing tokens -> fallback defaults
- Switching theme while offline

    ## 7) Acceptance criteria
    - Tokens map to Vuetify theme
- System theme supported
- User override stored
- No hardcoded brand colors in UI

    ## 8) Test plan
    - Unit: token->vuetify mapping
- Component: toggle theme
- E2E: persist theme across reload

    ## 9) Documentation updates
    - Update `modules/rep-app.md`
- Add token section to `ARCHITECTURE_BIBLE.md`

    Date: 2026-02-18
