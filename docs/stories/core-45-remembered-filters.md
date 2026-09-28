# CORE-45 — Remembered list filters, per user and per device

Design and decisions: https://claude.ai/artifact/2ZHvNpJnoXRE6U994Fsoxc (Łukasz, 2026-09-28).

## Story

As a rep, doctor or manager, I want each list to open the way I left it on this device (my filters, sort and rows per page), and never the way the previous person on a shared tablet left it.

## Decided

- Storage: `localStorage`, one entry per list and slot, key `neo:v1:{tenant}:{userId}:view:{viewId}:{filters|table}` (`@neo/prefs`).
- Saved: structured filters, sort, rows per page. **Not saved:** search text (patient names on shared devices) and page number.
- Entries unused for 90 days are forgotten, and are pruned at every sign-in.
- The old device-wide `app-settings.filters` go to the first person who signs in after the update, then are deleted.
- Language is per person (`neo:v1:…:locale`); the device keeps the last language used for the login screen. Theme stays per device (NEO-102).
- Later: filters in the URL (CORE-46). Server-side saved views only when someone asks for them.

## Acceptance criteria → tests

| Criterion | Test |
|---|---|
| Two accounts on one browser each have their own filters | `packages/prefs/src/persisted.spec.ts` › two accounts…; `apps/pwa/src/composables/useFilters.spec.ts` › another account… |
| Sort and page size survive a reload; the page number doesn't | `useListTableState.spec.ts` › sort and rows per page survive a reload |
| Search text isn't saved | browser check (e2e-prefs) › Search text is not remembered |
| A value that no longer exists doesn't empty the list | `useFilters.spec.ts` › drops a saved value that is no longer an option |
| Private mode / no storage → defaults, no errors | `storage.spec.ts` › works with no storage at all; › does not throw when the browser refuses the write |
| Old filters migrate once, never overwrite | `apps/pwa/src/utils/prefsSession.spec.ts` |
| 90-day expiry | `storage.spec.ts` › forgets and removes an entry unused for longer than 90 days; › pruneExpired |
