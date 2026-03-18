# SPEC-0029: Presentation Engagement Scoring v2

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: rep, bff  
Milestone: Phase 2

## 1) Goal
Improve slide engagement algorithm beyond basic time-on-slide.

## 2) User story
As ops/admin, I want a 0–100 engagement score per meeting so that we can measure presentation effectiveness.

## 3) Metrics
- Time per slide
- Scroll velocity
- Interaction count
- Revisit frequency

## 4) Data & API
- Score 0–100 computed in BFF or rep (event emission)
- Stored per meeting
- Visible in admin analytics (future)

## 5) Acceptance criteria
- Score 0–100
- Stored per meeting
- Visible in admin analytics (future)

## 6) Test plan
- Unit: score calculation from events
- Integration: score persisted with meeting
- Event taxonomy updated

## 7) Documentation updates
- EVENT_TAXONOMY (engagement events)
- Analytics section (when admin analytics exists)

Date: 2026-02-18
