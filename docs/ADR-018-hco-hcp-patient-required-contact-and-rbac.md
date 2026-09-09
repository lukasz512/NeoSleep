# ADR-018: Required contact fields and RBAC for Organization/Practitioner/Patient

## Status
Accepted

## Context

Two independent gaps were found in the HCO (`organization`)/HCP (`practitioner`)/`patient` domain:

**1. Missing data-quality validation.** `email` and `phone` were optional on
create for all three entities, and `organization` never validated phone
format at all (unlike `practitioner`, which already required ≥9 digits when a
phone was present). An HCO could be saved with neither a phone nor an email —
no way to contact the clinic at all.

**2. RBAC was either absent or decorative.**
- Backend: `POST`/`PATCH` on `organization`, `practitioner`, `lead` had no
  role check whatsoever — any authenticated role (`admin`, `manager`, `kam`,
  `msl`, `rep`, `doctor`) could call them. Only `DELETE` was `admin`-gated.
- Frontend: edit/add buttons on `HCOView`/`HCODetailView`/`HCPView`/
  `HCPDetailView`/`PatientsView`/`PatientDetailView` were gated by a local
  `isAdmin` computed (`role === "admin"`) repeated six times, with no
  server-side equivalent — a textbook "frontend is decoration" gap (see
  `.claude/skills/arch/SKILL.md` red flags). In practice `manager` couldn't
  *see* the edit buttons even though the API would have accepted the request.
- Separately, the router's `ALL_STAFF_ROLES` constant only listed
  `["rep", "doctor", "manager", "admin"]` — `kam` and `msl` are valid
  `StaffRole` values (DB `user_roles.role` CHECK constraint, `apps/pwa`
  `UserRole` type) but were missing from this list, which locked them out of
  Dashboard, Patients, and Planner entirely. `/leads`, `/hcp`, `/hco` router
  meta also omitted `kam`/`msl`.
- `/leads` (list, detail) was gated to `roles: ["rep"]` only — `manager`
  couldn't see the sales pipeline it's supposed to manage.

## Decision

**Validation** — `email` and `phone` are now required on `CREATE` for
`organization`, `practitioner`, and `patient` (`apps/api/src/commands/
{organization,practitioner,patient}.ts`), enforced as a hard block at create
time rather than deferred to a later lifecycle transition. `organization`
gained the same "≥9 digits" phone check `practitioner` already had. `UPDATE`
on all three now rejects an explicit attempt to blank out `email`/`phone`
(`input.email !== undefined && !trimmed`), but does not retroactively force a
fix on legacy rows that predate this change and aren't otherwise touched.

The one real creation path that bypasses `CreatePractitionerCommand` —
`InvitePractitionerCommand` (lead → "invite to partner" flow; direct
`POST /practitioner` has no add button in the UI, HCPs are only created via
lead conversion) — now also requires `lead.phone` before sending the invite,
so the requirement actually holds for the flow reps use, not just for the
otherwise-unused direct API route.

**RBAC matrix** for `organization`/`practitioner`/`patient`/`lead`:

| Role | HCO create/edit | HCP create/edit | Patient create/edit | Lead view/edit |
|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ✅ |
| manager | ✅ | ✅ | ✅ | ✅ |
| kam | ✅ | ✅ | ✅ | ✅ |
| msl | ✅ | ✅ | ✅ | ✅ |
| rep | ✅ | ✅ | ✅ | ✅ |
| doctor | ❌ | ❌ | ✅ | ❌ |

`doctor` is the only role excluded from HCO/HCP master data and from the
sales-pipeline `lead` entity — `kam`/`msl`/`rep` maintain these records as
their core field job, and `manager` manages that whole pipeline. No role is
excluded from `patient` — `doctor` manages their own patients' clinical data
same as everyone else. `DELETE` stays `admin`-only on all four entities,
unchanged.

Enforced in three places, all three required (any one alone would be
decorative or non-functional):
1. **Backend routes** — `requireRole("admin","manager","kam","msl","rep")` on
   `organization`/`practitioner` `POST`/`PATCH` and on `lead`
   `GET`/`POST`/`PATCH` (`patient` needed no change — the desired set is "every
   role", i.e. `requireAuth` already expressed it).
2. **Frontend router** — `ALL_STAFF_ROLES` now includes `kam`/`msl`; `/hcp`,
   `/hco`, `/leads` route `meta.roles` widened to
   `["rep","kam","msl","manager","admin"]`.
3. **Frontend component gating** — new `apps/pwa/src/composables/
   usePermissions.ts` centralizes `canEditOrganizations`/`canEditPractitioners`/
   `canEditPatients`, replacing the six duplicated `isAdmin`-only checks. Its
   own doc comment states the mirroring requirement explicitly, since nothing
   enforces it automatically.

## Consequences

- A rep/KAM/MSL creating an HCO in the field must now supply both a phone and
  an email up front; there is no "quick capture, fill in later" path for HCO.
  If that friction turns out to matter in practice, the fix is a `lead`-first
  capture flow (already exists as a pattern) rather than loosening this
  requirement.
- `kam` and `msl` staff, if any exist today, gain access to Dashboard,
  Patients, Planner, Leads, HCP, and HCO that they did not have before this
  change (they were previously locked out of nearly the entire app by the
  `ALL_STAFF_ROLES` gap, not by design).
- `manager` gains real (not just requested) edit rights on HCO/HCP/Patient and
  visibility into `/leads` — previously blocked purely by the frontend
  `isAdmin` gate despite the backend already allowing it.

## Compliance Impact

None beyond what already applied: `email`/`phone` on `organization` are
non-personal business contact data; on `practitioner`/`patient` they are
already-covered personal data (GDPR Art. 6) with no new collection purpose,
only a stricter presence requirement at write time. No schema/migration
change — validation moved, no new column.
