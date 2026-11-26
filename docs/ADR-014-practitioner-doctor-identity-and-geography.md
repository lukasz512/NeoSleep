# ADR-014: Practitioner/doctor-user identity linkage, and region/territory_id/country_code consolidation onto `identities`

## Status
Accepted

## Context

### Practitioner ↔ `users(doctor)`
A working partner-onboarding flow already existed (`commands/inviteDoctor.ts`, migration `009_partner_invite_and_documents.sql`): staff invites a doctor-type `Lead`, the invitee sets a password and signs GDPR + a partner agreement (handwritten signature, PDF, `consent`, `file_attachment`, `audit_log`), and becomes a `users` row with role `doctor`. This flow never created a matching `practitioner` row — a doctor onboarded this way would not appear in the HCP tab, even though `practitioner` and `users(doctor)` were confirmed (this session) to represent the same real person, not two populations. `practitioner` also has no login columns at all (no `google_sub`/`password_hash`), confirming it was designed purely as a CRM/sales-engagement record (`influence_tier`, `engagement_level`, `prescribing_volume`, `visit_count`), not an account.

A second, unrelated inconsistency surfaced while investigating: `insertStaffUser` (`db/users.ts`) upserts `identities` on `ON CONFLICT (email)`, so it gracefully reuses an existing identity when the email already belongs to one — but `insertPractitioner` (`db/practitioner.ts`) did a plain `INSERT` with no conflict handling, so adding a practitioner with an email that already belonged to a `users` row would throw a unique-constraint error instead of linking to it.

This is exactly the scenario flagged in project memory `project_doctor_patient_portal_deferred.md` ("merging practitioner into users is a real, hard-to-reverse schema pivot — re-confirm scope first") — re-confirmed live this session (2026-07-20): practitioner and doctor-user are the same identity; manager sees doctors; doctor sees only their own facility/patients, no HCP/HCO nav access (already enforced by existing route roles).

### region / territory_id / country_code duplication
`users`, `practitioner`, `patient`, and `lead` (all TPT children of `identities`) each carried their own `region`, `territory_id`, and `country_code` columns — the same "home region of this person" concept, duplicated four times. `identities` is the natural single source of truth, matching how `title`/`first_name`/`email`/`phone` already live there.

One nuance surfaced and was explicitly checked before proceeding: `user_roles.region` is a *different* concept (per-role access scope — one user can hold a role in multiple regions, or `NULL` for "all regions", per that table's own column comment) and was correctly left untouched.

## Decision

1. **`InviteDoctorCommand` renamed to `InvitePractitionerCommand`** (file: `commands/invitePractitioner.ts`), same for `AcceptDoctorInviteCommand` → `AcceptPractitionerInviteCommand`. "Doctor" is a tenant-facing display label, not a FHIR/code-level concept — the entity being created is a Practitioner (+ a `users` account for login). Routes and PWA already used neutral naming (`/lead/:id/invite`, `inviteToPartner`, `PartnerRegistrationView.vue`) — only the command layer needed the rename.
2. **`InvitePractitionerCommand` now also creates/links a `practitioner` row** on the same identity as the new `users(doctor)` row. No new linking column needed: `insertStaffUser` and `insertPractitioner` both upsert `identities` by email (`ON CONFLICT (email) DO UPDATE`), so passing the same email resolves both to one `identity_id`.
3. **`insertPractitioner` fixed** to match `insertStaffUser`'s conflict handling: `ON CONFLICT (email) DO UPDATE` on the `identities` insert, and `ON CONFLICT (identity_id) DO NOTHING` + fallback lookup on the `practitioner` insert (so re-adding an HCP that already has a practitioner row links instead of erroring).
4. **`region`, `territory_id`, `country_code` moved from `users`/`practitioner`/`patient`/`lead` to `identities`** (migration `010_identity_geography.sql`): additive column creation, COALESCE-based backfill from all four source tables (never overwrites an already-populated `identities` value), then the four duplicate columns dropped. Application layer (`db/lead.ts`, `db/practitioner.ts`, `db/patient.ts`, `db/users.ts`) updated to read/write these fields via the existing `identities` JOIN each file already had. `user_roles.region` untouched.
5. Per the same precedent as migrations 004/005/009, `create_tenant_schema()` in `001_tenant_schema.sql` was **not** hand-edited for the geography consolidation (transcription-error risk across four table definitions, no new tenant being provisioned right now) — noted as a known gap in migration 010's header.

## Consequences
- A doctor onboarded via the partner-invite flow now appears in the HCP tab immediately (practitioner row created at invite time, before acceptance).
- `identities.region`/`territory_id`/`country_code` is the only place to look going forward for "this person's home region" — any new code must not re-add these columns to a TPT child table.
- Raw SQL column changes are invisible to `tsc` — verified by grepping every table-alias reference (`u.region`, `p.region`, `l.region`, etc.) across `apps/api/src` after the change, not just typecheck/lint.
- Still **not** done (separate, explicitly deferred work): doctor-scoped UI (patient list filtered to "my patients", own-facility view, calendar), and a proper `patient ↔ practitioner` many-to-many for the "patient has multiple doctors" case (pulmonologist doing remote sleep-study review + a treating dentist) — tracked in `docs/foundation/FEATURE_BACKLOG.md`.

## Compliance Impact
No new personal-data category introduced. `identities.region`/`territory_id`/`country_code` were already in the GDPR data map via the four tables they were consolidated from. The partner-invite flow's existing consent/signature/audit trail (migration 009) is unchanged — this ADR only adds a `practitioner` row alongside the existing `users` row, it does not alter what is captured or how consent is recorded.
