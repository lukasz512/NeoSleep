# CORE-181 — Live data layer: Pinia Colada, patient card as the pattern

## Story

As a doctor or staff member, when I save something about a patient I want every screen that shows it to follow at once, without F5, so I never act on stale data and never wonder whether the save worked.

## Context

- Before: the card refreshed through hand-written window events (`patient-changed`, `checklist-updated`); any part nobody wired up stayed stale until F5, and every visit to the card refetched behind a spinner.
- Decision D3 of form core-175-decisions: Pinia Colada now, live push from the API (SSE) later in its own ticket.

## Decided

- Keys: everything about one patient lives under `["patient", id, …]` (`detail`, `summary`, `appointments`, `events`). A write invalidates the prefix, so every part refetches together (`useInvalidatePatient`).
- Fresh for 30 s: a card opened again within that window doesn't refetch; after it, the cached record shows at once and revalidates in the background.
- The patient edit is optimistic: the card shows it before the server answers; a failure puts the cached record back and shows the error toast.
- `patient-changed` and `usePatientChanged.ts` are gone. The checklist (`checklist-updated`) and notes (`notes-changed`) still sync through their own composables' events; moving them is the follow-up (see ADR-029).
- The e2e seed adds an admin, a doctor and a patient (local DBs only, CORE-180 guard).

## Acceptance criteria

- [ ] A user books a visit on the patient card → the next-visit tile and the visits list show it at once, it is still there after a reload, and the calendar shows the same visit.
- [ ] A user renames the patient on the card → the header shows the new name at once and the patient list shows it after in-app navigation, without F5.
- [ ] Returning to a patient card shows the cached record immediately (no spinner) and revalidates it in the background.
- [ ] A failed save of the patient rolls the card back to what the server holds and shows the error.
