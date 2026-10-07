# ADR-029 — Query cache with Pinia Colada (patient card first)

- Status: accepted (2026-10-08, CORE-181)
- Decision by: Łukasz (form core-175-decisions, D3 "more")

## Context

Views fetched with `apiFetch` into local refs and kept each other fresh with window events (`patient-changed`, `checklist-updated`, `notes-changed`, `entity-list-refresh`). Every new screen had to remember to emit and listen; the ones that didn't stayed stale until F5. Every visit to a view refetched behind a spinner.

## Decision

Server data in the PWA lives in **Pinia Colada** queries under hierarchical keys; writes invalidate keys instead of sending events.

- **Keys** start with the entity and its id: `["patient", id, "detail" | "summary" | "appointments" | "events"]`. Invalidating `["patient", id]` refreshes every part of that patient at once. Key factories live next to the entity's composable (`apps/pwa/src/composables/usePatientQueries.ts`).
- **Reads**: `useQuery` with `staleTime` 30 s. Show `data` whenever it exists; the spinner is only for a first load with nothing cached.
- **Writes**: `useMutation`. `onMutate` writes the optimistic value into the cache and returns the previous one, `onError` restores it, `onSettled` invalidates the entity's prefix. The caller keeps its toast/field-error handling (`useEntitySubmit`).
- **No window events** for data that a query holds. A component that changes data calls the invalidate helper; a component that shows data reads the query.

## Pattern for the next view

1. Add a key factory and `use<Entity>Query` / `use<Entity>PartQuery` beside the entity's composable.
2. Replace the view's `ref` + `onMounted(load)` with the query; derive `loading` / `loadFailed` from it.
3. Replace each `dispatchEvent` / `on<Entity>Changed` pair with `invalidate<Entity>(id)`.
4. Tag a real-backend e2e `@<TICKET> ACn` that saves on one screen and checks another (CORE-182).

## Consequences

- Next: the checklist (`usePatientChecklist`, `checklist-updated`), notes (`useNotes`, `notes-changed`), the calendar and the entity lists (`entity-list-refresh`) move to queries; then live push from the API (SSE) invalidates keys when someone else changes data.
- Until then the patient card still hears `checklist-updated` and invalidates its own queries on it.
