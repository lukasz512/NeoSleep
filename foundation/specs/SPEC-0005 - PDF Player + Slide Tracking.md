# SPEC-0005: PDF Player + Slide Tracking

Status: Draft
Apps/Modules: rep
Milestone: MVP

## Goal
Display PDF presentations and track engagement.

## Requirements
- Show PDF full-screen
- Track:
  - page number
  - time spent
  - scroll depth
- Emit events via /api/events

## Events
rep_slide_viewed
rep_slide_engagement

## Privacy
- No medical data in event payload

## Tests
- Unit: page change detection
- E2E: open presentation → track events