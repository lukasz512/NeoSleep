# SPEC-0004: Offline Meeting Mode

Status: Draft
Apps/Modules: rep
Milestone: MVP

## Goal
Allow rep to run meeting for ~30 minutes without internet.

## Requirements
- Cache PDFs before meeting
- IndexedDB queue for:
  - PCF submissions
  - slide events
- Auto retry when back online
- Show sync status indicator

## UX
- Offline badge in header
- Pending sync count
- Manual retry button

## Tests
- Simulate offline in Playwright
- Submit PCF offline → reconnect → sync