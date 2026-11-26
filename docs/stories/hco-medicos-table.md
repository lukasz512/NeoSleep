## Refined User Story: HCO "Médicos" tab as a table with per-doctor stats (NEO-14)

**Classification**: feature — replaces a plain list with a data table and adds new cross-table aggregation (practitioner × patient × treatment_plan).
**Raw input**: "ta lista to ma byc tabela, taka sama jak lista pacjentow itd: filtry, wyszukiwarka. uzyj gotowych komponentow. na liscie lekarzy widac: nazwisko, specjalizacja, liczba pacjentow, liczba powiazanych Dispositivos, procent wartosc wydajnosci: ilosc urzadzen / ilosc pacjentow."

### As a rep / KAM / manager, I want to see a clinic's doctors in a searchable, filterable table with patient count, ordered-device count and device/patient efficiency so that I can tell at a glance which doctors at that clinic convert patients into DAN/MAD orders.

### Decisions (made with Łukasz, 2026-09-24)
- **Doctors of a clinic** = practitioners affiliated via `practitioner_organization` (NEO-17) **OR** whose `practitioner.organization_id` is the clinic. Applies to the existing `organization_id` filter on `GET /practitioner` too (its only consumer was this tab).
- **Patient count** = all non-deleted `patient` rows with `patient.practitioner_id` = doctor (global per doctor — patients have no clinic link).
- **Dispositivo** = DAN/MAD device ordered through OrthoApnea = `treatment_plan` with `type = 'dental_appliance'`, not deleted, `status <> 'cancelled'`, and not a local draft (`metadata ? 'orthoapneaDraft'`). Attributed to the doctor via `treatment_plan.dentist_id` (the doctor chosen on the order; defaults to the patient's own doctor in the wizard).
- **Efficiency** = devices / patients × 100, rounded to an integer %; `null` ("—") when the doctor has 0 patients. Can exceed 100% when a doctor is chosen on orders for patients attributed to another doctor.

### Stakeholder Notes
- 👤 User: reps/KAMs visiting a clinic need to know who to target; today the tab is a bare name list with no signal.
- 🏢 Client: gives the tenant a per-doctor conversion signal (patients → devices), a core KPI for a device-order business.
- 🩺 Patient: no downstream patient effect — aggregate counts only, no patient-level data exposed.
- 🚀 NeoCRM/Platform: generic (practitioner/organization/treatment_plan are core tables); reuses `AppEntityList`, no tenant-specific code.
- ⚖️ Compliance: counts are aggregates over GDPR Art. 9 data (patients, treatments). The doctor rows remain territory-scoped (existing `scopePaths`); counts are per doctor, not filtered by the caller's patient scope — acceptable as non-identifying aggregates, but flag for `/legal` if small-number re-identification ever becomes a concern. List is not cached offline (`cacheable=false`).

### Medical-Industry Trend Check
- n/a — internal CRM list view.

### Acceptance Criteria
- [ ] HCO detail → "Médicos" tab renders `AppEntityList` (search + specialty filter, desktop table / mobile cards), not the plain list.
- [ ] Columns: name (with avatar, row click → HCP detail), specialty (translated label), patients, devices, efficiency %.
- [ ] Doctors affiliated via `practitioner_organization` only (no `organization_id` match) appear in the list.
- [ ] Patient count excludes soft-deleted patients.
- [ ] Device count excludes non-`dental_appliance`, cancelled, soft-deleted and draft plans.
- [ ] Efficiency shows "—" for 0 patients, otherwise `round(devices / patients * 100)%`.
- [ ] Table sortable by name, patients, devices, efficiency.
- [ ] Endpoint requires auth; out-of-territory doctors are not listed for a scoped rep (existing scope rules).
- [ ] All new copy in en/pl/mx i18n.
- [ ] API integration test against real DB covers affiliation membership + every count exclusion; PWA spec covers the tab wiring.

### Open Questions
- none (decisions above resolved on 2026-09-24)

### Hand-off
→ `/dev feat hco-medicos-table` — scope clear, no schema change (reads existing tables).
