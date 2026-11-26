# NEO-132 — One date component + strict date validation

**Ticket:** NEO-132 · **Decided by Łukasz, 2026-09-27** (Artifact PoqLHsxPrhTbVBRnJyksqZ)

## Problem
Every date field used the browser's native `<input type="date">` / `datetime-local`. It let a 5-digit year through (`10/10/19900`), showed `mm/dd/yyyy` on an English OS even in PL/MX, and its calendar popup looked different in every browser.

## Decisions
- **Calendar A:** typed DD/MM/YYYY in the app language's order (max 8 digits, so no 5th year digit) + a small calendar card under the field; a bottom sheet on phones.
  - Date of birth opens on the year grid; visit/study dates get Today / Yesterday / A week ago chips.
- **Time: T2.** Date | Time are two fields side by side, both from the same component (`mode="datetime"`). The time field has a list of 15-minute slots. In the appointment dialog, slots that would overlap the doctor's other bookings are struck through.
- **Study date:** no future dates (UI and API). **New appointments:** no past date or time.

## Acceptance criteria
1. No native date/datetime input is left in apps/pwa. Date of birth, study date, appointment start, and event start/end all use `AppDateField`.
2. A 5-digit year or an impossible date (31/02) can't be entered. The field says why (e.g. "February 2026 has 28 days").
3. A half-typed date shows no error while typing, and an error once the field is left.
4. The format follows the app language: PL `DD.MM.RRRR`, MX `DD/MM/AAAA`, EN `MM/DD/YYYY`.
5. The API rejects a future `study_date` (400, field `study_date`).
6. The appointment time list marks the chosen doctor's taken slots before Save.

## Out of scope
- Server-side "no past appointment" check. The API already blocks double booking; past bookings stay possible for back-filling.
