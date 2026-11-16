## Refined User Story: Region access — one scope rule for every resource

**Ticket**: CORE-226
**Classification**: feature
**Raw input**: Rescheduling a visit on pwa-dev answered "Este paciente está fuera de su región." We must decide how
access works with many regions inside one database; "this must work better". Later (2026-11-16): plan it once and
properly, with platform growth in mind, no bottlenecks, easy to duplicate between clients.

### As a tenant user (rep, KAM, MSL, manager, doctor, admin), I want every record to follow one access rule derived from my role grants, so that I always see exactly my scope and understand why something is refused

### Stakeholder Notes
- 👤 User: field force and managers work inside their territory subtree; doctors work inside their care team. Today
  the rule differs per resource and every refusal reads "outside your region", so users cannot tell what to do next.
- 🏢 Client: a tenant operating in several countries needs country-level admins and managers, and must be able to
  show an auditor who can see which patient. A record without a territory is visible to every user today.
- 🩺 Patient: indirect but real. A patient record visible outside its region, or a doctor in another country reading
  it, is a health-data exposure. Cross-country care needs the patient's recorded consent (D2).
- 🚀 NeoCRM/Platform: adding a country or onboarding a tenant in a new country must be data, not a code change
  (D4). PL/MX literals sit in 7 places today.
- ⚖️ Compliance: cross-country access to health data is a transfer to another country (GDPR chapter V for PL → MX,
  LFPDPPP for MX). Needs `/perspective legal` on the consent wording before slice 4 ships.

### Medical-Industry Trend Check
- n/a — platform RBAC change.

### Decisions (form region-access-r1, answered 2026-11-16, all five = the recommended variant)
- **D1** Territory is mandatory and auto-assigned: from the organization, else from the creator. A migration
  backfills existing rows; after that a NULL territory is visible to admins only.
- **D2** A doctor from another country may join a patient's care team only with the patient's recorded consent;
  the grant writes an audit row. Inside one country the care team alone decides (unchanged).
- **D3** Scope always follows the role grant: a grant on the `global` root sees the whole tenant, a grant on a
  country sees that country. One rule for every role and every resource, admin included.
- **D4** Country registry in the platform DB (timezone, language, currency, jurisdiction). National ID validators
  (PESEL, CURP) stay in code as per-country plugins.
- **D5** A user with grants in several regions sees them all together, plus a region filter on lists and the
  calendar, remembered per user and shown only when the user holds more than one region.

### Decided by default — a test proves it
- Each 403 reason has its own message in the PWA (outside region / not your patient / only the booker can change).
- Create and update of practitioner, organization and lead follow the same territory rule as reads.
- Both scope helpers treat a NULL territory the same way.
- Future appointments follow the patient's territory when it changes; past ones keep their snapshot.
- A territory that still has role grants cannot be deleted (`user_roles.territory_id` is NOT NULL with
  ON DELETE SET NULL today, which can only fail at runtime).

### Slices (one PR each, in this order)
1. **Honest refusals + consistent checks.** A `reason` on every appointment and scope 403, PWA maps reason →
   message; create/update/delete of practitioner, organization and lead (and patient create) scoped like reads;
   a territory with role grants can't be deleted (409 `TERRITORY_IN_USE`). No data change.
2. **Mandatory territory (D1).** Auto-assign on create for patient, practitioner, organization, lead; backfill
   migration; then fail-closed, with one NULL rule in both scope helpers (moved here from slice 1: aligning them
   before the backfill would mean opening the country-code helper, which denies NULL today). The backfill list (row counts per table, the rule that picked each territory) is
   shown to Łukasz and approved before it runs on the shared database.
3. **Scope follows the grant (D3).** Remove the admin special cases; every list/get/write resolves scope from
   `user_roles`. Appointment territory follows the patient for future rows.
4. **Cross-country care team with consent (D2).** Consent record + audit row; `/perspective legal` first.
5. **Country registry (D4).** Platform table + per-country validator plugins; remove the 7 PL/MX literals.
6. **Region filter (D5).** Shared filter on lists and calendar, persisted per user.

### Acceptance Criteria (testable)
- [ ] For each of patient, practitioner, organization, lead, appointment, encounter: list, get, create and update
      are tested for a PL rep, an MX rep, a PL manager, a PL-only admin, a global admin and a doctor.
- [ ] A user with no role grants sees no records at all, including records with a NULL territory (after slice 2).
- [ ] Creating a patient without choosing a territory stores the organization's territory, else the creator's.
- [ ] After the backfill no patient, practitioner, organization or lead identity has a NULL territory.
- [ ] A PL-only admin cannot list or open an MX appointment; a global admin can.
- [ ] Adding an MX doctor to a PL patient's care team is refused without a consent record and succeeds with one,
      writing one audit row.
- [ ] Adding a country row to the registry makes it selectable in territory, timezone and email-locale logic with
      no code change; a country without an ID validator accepts any national ID format.
- [ ] A user with one region never sees the region filter; a user with two sees it and the choice survives a reload.
- [ ] Each 403 reason renders its own i18n message in en, pl and mx.

### Open Questions
- [ ] Not yet verified on data: which refusal produced the original "fuera de su región" (hypothesis: "only the
      booker can change it", or a stale appointment territory snapshot). Slice 1 reproduces it in a test.
- [ ] Consent wording and legal basis for cross-country access → `/perspective legal` before slice 4.

### Hand-off
→ `/arch assess region-access` — slices 2, 3 and 5 touch schema and multi-tenant isolation
→ `/dev feat` — slice 1 is self-contained and can start right away
