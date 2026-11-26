## Refined User Story: Fix staff role edit-save bug + restrict role changes to admin

**Classification**: feature
**Raw input**: Łukasz (PL): wanted the staff role set simplified to Admin/Manager/Doctor/Rep, called `kam`/`msl` "old roles" for a "full refactor," and said role changes should be admin-only. On clarification about removing `kam`/`msl` from the DB entirely, he narrowed scope: "napraw walidacje i zmien zeby doctor byl capital" (fix the validation, and make sure 'doctor' displays capitalized). He confirmed no existing rows currently hold `kam`/`msl`, but did not confirm removing them now — that stays a separate, deferred decision.

### As an admin, I want to edit any field on an existing doctor-role user (territory, region, status) without the save failing on their unrelated, unchanged role, and I want role changes restricted to admins only, so that partner-onboarded doctor accounts stay editable day-to-day and the GDPR-consent-gated provisioning path (ADR-014) can't be bypassed by a manager quietly reassigning roles.

### Stakeholder Notes
- 👤 User: Admins hit a hard save failure editing an existing doctor user's territory/status — the exact repro in the screenshot. Today a manager can also silently change any user's role via the same PATCH endpoint, which nobody asked for and Łukasz now wants closed.
- 🏢 Client: Tenant admins need to keep partner (doctor) accounts current (territory reassignment, disabling) without being blocked by an internal validation quirk. Role-change auditability (who changed a role, when) matters for the tenant's own compliance reporting.
- 🩺 Patient: No direct effect. Indirect: doctor accounts are the login for practitioners who see patient data via the (deferred) doctor-scoped UI — keeping their record maintainable, and keeping role assignment tightly controlled, protects that access boundary.
- 🚀 NeoCRm/Platform: This is a correctness/RBAC-hardening fix, not a new capability — applies uniformly to all tenants, no white-label-specific work.
- ⚖️ Compliance: ADR-014 documented that `doctor`-role accounts are only ever created via `InvitePractitionerCommand`'s GDPR-consent + signed-partner-agreement flow (migration 009) — never a generic form. That exclusion must be preserved for *role assignment*; it must NOT extend to blocking edits of a doctor user's other fields (the current bug), and it must not be loosened to let a generic admin form set `role=doctor` directly (would bypass consent capture). Restricting role changes to admin-only is itself a compliance-relevant tightening (least-privilege on a sensitive field) — no legal review needed, this is enforcement of an existing documented boundary, not a new policy.

### Medical-Industry Trend Check
n/a — internal RBAC/bugfix, not a clinical or HCP-engagement-facing change.

### Acceptance Criteria
- [ ] `PATCH /api/v1/users/:id` no longer throws `ValidationError` when `role` is present in the payload but unchanged from the target user's current role (covers existing `doctor`, and legacy `kam`/`msl`, accounts).
- [ ] `PATCH /api/v1/users/:id` still rejects any attempt to *change* a role to/from `doctor` through this endpoint (that path stays exclusive to `InvitePractitionerCommand`).
- [ ] `PATCH /api/v1/users/:id` (and `POST /api/v1/users` role-on-create, where relevant) rejects a `role` change when the acting user is not `admin` — a `manager` calling this today must get a `403`, not a silent role change.
- [ ] Frontend: the role field on the existing "edit user" dialog is disabled/read-only for a non-admin acting user, and always renders the current role through the existing `user.users.role.*` i18n labels (already present and capitalized in en/pl/mx) — never a raw unmatched value like lowercase `doctor`.
- [ ] Editing an existing doctor-role user's territory/region/status from the UI succeeds end-to-end (manual or integration test reproducing the screenshot's exact flow).
- [ ] No change to `apps/api/migrations/` or the `user_roles` CHECK constraint — `kam`/`msl` removal stays explicitly out of scope for this story.
- [ ] i18n parity unaffected (no new keys needed — `user.users.role.doctor` already exists in all three locales).

### Open Questions
- [ ] None blocking — kam/msl full removal is acknowledged as a separate future story, not needed here since no live rows use them.

### Hand-off
→ `/arch assess role-edit-rbac-fix` — touches an RBAC/compliance boundary (role-change authorization) even though it's schema-neutral; worth a quick architecture sign-off on the enforcement point (command layer vs. route layer) before `/dev` implements.
