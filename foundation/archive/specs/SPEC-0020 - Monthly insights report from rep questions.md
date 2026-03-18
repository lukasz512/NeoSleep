    # SPEC-0020: Monthly insights report from rep questions

    Status: Draft  
    Owner: Neo Sleep Care  
    Milestone: MVP  
    Apps/Modules: bff

    ## 1) Goal
    Generate a monthly report summarizing reps' questions and automation opportunities.

    ## 2) User story
    As admin/ops, I want to know what reps struggle with and what to improve next.

    ## 3) UX flow
    - N/A (v1: generated doc/email)

    ## 4) Data & API
    Pipeline:
- BFF stores anonymized question metadata
- Monthly job triggers Make webhook
- Make calls OpenRouter summarizer and writes report (Notion page or email)

    ## 5) Events & analytics
    - `bff_monthly_insights_generated`

    ## 6) Edge cases
    - Low data volume
- Sensitive info in questions (needs redaction)

    ## 7) Acceptance criteria
    - Report generated monthly
- Includes top topics + suggested automations
- Stored in Notion or emailed

    ## 8) Test plan
    - Unit: aggregation
- Integration: webhook trigger mocked

    ## 9) Documentation updates
    - Update AI hub section

    Date: 2026-02-18
