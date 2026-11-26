## Refined User Story: One person-name cell everywhere (salutation + avatar), "Médico" label on Tratamientos

**Classification**: feature. A bug fix plus a cross-cutting refactor: it changes the API display-name contract on several endpoints and touches many PWA views.
**Linear**: NEO-13
**Raw input**: "w kolumnie jest dentisa i nie medico - wszedzie ma byc medico. sprawdz to na wszystkich widokach. poza tym name nie ma dr w nazwie - to duzy blad. wszedzie na widokach (w tabelach itd) to ma byc jeden komponent, ktory generuje avatar, salutation if aplicable i name i last name. hoisting, refaktor calego pwa. upewnij sie ze pokrycie testami jest wysokie i ze sa zasadne logicznie."

Scope agreed with Łukasz in the 2026-09-24 session:
- The salutation is added on the **backend**, through the existing `formatDisplayName()`.
- The shared component is used in **all table/list cells and related-entity links**. Detail-view headers are out of scope.
- The label becomes **Médico / Doctor / Lekarz**.

### As a rep/manager, I want every person's name in a table to show their professional title (Dr./Dra./Prof.) with an avatar, rendered the same way on every screen, so that I can recognise doctors at a glance and the app feels consistent.

### Stakeholder Notes
- 👤 User: Reps and managers scan the Tratamientos and Estudios lists by doctor. Today the "Dr." is missing there, although the same doctor shows "Dr." on the HCP list. That inconsistency reads as a data error.
- 🏢 Client: In MX, addressing a physician without "Dr./Dra." is a real etiquette failure in client-facing demos. Consistency is part of a white-label product's perceived quality.
- 🩺 Patient: No downstream effect on patient care. This is display only; no clinical data changes.
- 🚀 NeoCRM/Platform: Centralising the display-name rule (one API util and one PWA component) keeps the rule the same for future tenants. The `DISPLAYED_SALUTATIONS` allow-list stays the single rule.
- ⚖️ Compliance: No early flags. The API only reads `identities.title`, which it already returns elsewhere. No new personal data is exposed: salutation is already in the patient, practitioner and lead DTOs. External partner payloads (OrthoApnea) and legal signer names (`invitePractitioner.ts` e-signature) are deliberately **not** changed, because they are contractual/legal strings, not UI display.

### Medical-Industry Trend Check
- n/a (internal consistency fix and refactor).

### Acceptance Criteria
**API: display names go through `formatDisplayName()`**
- [ ] `treatmentPlan.ts`: `dentist_name` and `patient_name` include the salutation when it is Dr./Dra./Prof. (select `di.title`/`pi.title`).
- [ ] `sleepStudy.ts`: `patient_name` and `interpreted_by_name` go through the same rule.
- [ ] `organization.ts`: names in the practitioner list for an HCO go through the same rule.
- [ ] `users.ts` (`name`), `note.ts` (`author_name`) and `audit-log.ts` (`user_name`) go through the same rule.
- [ ] Out of scope, left unchanged on purpose: `services/partners/orthoapnea.ts` (partner contract) and `commands/invitePractitioner.ts` signer name (legal signature). Search filters (`LOWER(first || ' ' || last) LIKE`) keep working unchanged.
- [ ] Integration tests against a real DB: one row with "Dra." shows the salutation, one with "Lic." hides it, and a NULL salutation gives plain "First Last". This covers at least treatment plans, sleep studies and the HCO practitioners list.

**PWA: one shared person-name component**
- [ ] One component renders avatar + display name, and a link when a route is allowed. It extends or replaces `EntityLink.vue`. It passes `first_name`/`last_name` for initials when available, so "Dr. Ana López" gets the initials "AL", not "DA".
- [ ] It is used in every table/list person cell: Patients, HCP, Leads, Users list rows; Tratamientos and Estudios patient + doctor columns; related-entity panels, notes and history authors.
- [ ] The duplicated `AppAvatar` + name markup in the list views is gone (hoisted).
- [ ] Component spec covers: link vs plain vs empty ("—"), initials from parts vs from the display name, and person vs place (HCO shows an icon).

**Label**
- [ ] `app.treatmentPlans.table.dentist` is renamed to `app.treatmentPlans.table.doctor`: en "Doctor", pl "Lekarz", mx "Médico". i18n parity passes.
- [ ] No other user-facing "dentist/dentista/dentysta" label remains in PWA app views (the marketing website copy is out of scope).

**Quality**
- [ ] `pnpm -r typecheck`, lint and tests pass. The before/after visual artifact is attached to NEO-13.

### Open Questions
- none (resolved in the 2026-09-24 session)

### Hand-off
→ `/dev feat neo-13-person-display-name`. The scope is clear and there are no schema changes.
