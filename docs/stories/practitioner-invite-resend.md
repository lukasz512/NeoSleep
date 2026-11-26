## Refined User Story: Resend a practitioner (HCP) invite once the previous one has expired

**Classification**: feature
**Raw input** (translated from Polish): "When I invite an HCP to collaborate, he gets an email with the registration form — once I've sent it, I can't send it again, and the doctor hasn't accepted it. I'd like the ability to resend this email when the previous one has expired."

### As an admin or manager, I want to resend a doctor's registration invite when they haven't completed it in time, so that a doctor who missed or ignored the first email isn't permanently stuck and the practice relationship isn't lost.

### Architecture findings (verified against the actual code, not assumed)

- The relevant flow is `ActivatePractitionerCommand` (`apps/api/src/commands/practitioner.ts:234-306`, `POST /api/v1/practitioner/:id/activate`), triggered by the "Activate" button in `HCPDetailView.vue:39`. It mints a real 7-day-expiry `invite_tokens` row and sends `sendPartnerInviteEmail` with the `/partner-register?token=...` link.
- A real, enforced expiry already exists server-side: `getInviteTokenByHash` (`apps/api/src/db/invite.ts:44-60`) filters `WHERE used_at IS NULL AND expires_at > now()`. An expired token genuinely stops working, independent of any UI.
- **The actual blocker is a status-semantics bug, not a missing feature per se.** `practitioner.status` flips to `"active"` unconditionally on the very first Activate click (`practitioner.ts:242`), regardless of whether the doctor ever finished registering (`AcceptPractitionerInviteCommand` is the thing that actually completes registration — setting a password). So `status === "active"` today conflates two different real states: "an invite was sent" and "the doctor actually onboarded." The Activate button then disappears (`HCPDetailView.vue:39`, `v-if="hcp.status === 'pending_approval'"`), and `ActivatePractitionerCommand` itself throws `ConflictError` if status is already `"active"` (`practitioner.ts:239`) — so there is currently no path to re-trigger the email at all, expired or not.
- Closest existing, provably-working pattern to reuse: `ResetUserPasswordCommand` (`apps/api/src/commands/users.ts:154-185`) — admin-triggered, no status gate, callable repeatedly, mints a fresh token and sends a new email every time.
- Email copy already anticipates expiry (`email.partnerInvite.expiry` i18n key in `sendPartnerInviteEmail`, `apps/api/src/mailer.ts:252-`) — little to no email-template work needed.

### Stakeholder Notes
- 👤 User: admin/manager (the only roles that can Activate a practitioner today). Today's workaround is none — Łukasz reported being stuck with no in-product recourse once a doctor misses the window.
- 🏢 Client: every doctor stuck at "invited but never onboarded" is a lost HCP relationship the tenant paid to grow — a direct retention/ROI concern for the pharma company licensing the platform, not just an internal nuisance.
- 🩺 Patient: indirect but real — a doctor who never completes onboarding can't be assigned/manage patients through NeoSleep, so patients who'd have been served through that relationship aren't. Not urgent, not zero.
- 🚀 NeoCRM/Platform: this is a generic onboarding-reliability gap that any future white-label tenant would hit identically — worth fixing at the platform level, not as a one-off patch for this tenant.
- ⚖️ Compliance: the invite token is effectively a password-setup credential, same security class as a password-reset link. A resend feature needs the same hygiene already established for password reset: single-use tokens, no account-existence leakage, reasonable rate-limiting against accidental repeat-clicks. No new PII collection, so no elevated GDPR/LFPDPPP flag beyond standard secure-token practice.

### Medical-Industry Trend Check
n/a — internal operational/workflow fix, not a clinical or patient-facing design decision.

### Acceptance Criteria
- [ ] An admin/manager can trigger a fresh invite email to a practitioner whose previous invite token has expired without being used.
- [ ] The new email uses a newly-minted token; the previous (expired) token stays invalid (it already is, by expiry).
- [ ] `practitioner.status` (or a new, separate field) correctly distinguishes "invite sent, not yet accepted" from "doctor completed registration" — the fix must not just patch the symptom while leaving the status conflation in place, since other views/reports may already read `status === "active"` assuming it means "onboarded."
- [ ] The HCP detail view surfaces, in some form, that an invite is pending/expired (not just silently offering no action).
- [ ] Resending is rate-limited or otherwise guarded against accidental rapid repeat-sends.

### Open Questions
- [ ] **Root-cause fix vs. new bolt-on command**: should this be a genuinely new `ResendPractitionerInviteCommand` (mirroring `ResetUserPasswordCommand`, minimal change), or should it fix `practitioner.status`'s conflation directly — i.e., stop flipping to `"active"` until the doctor actually accepts, and let the *existing* Activate flow be re-triggerable while status is "invited but not yet accepted"? The second is more correct but is a status-semantics change that could affect other code/reports currently reading `practitioner.status`.
- [ ] If status semantics change, what should the new/corrected states be, and does anything else in the codebase (dashboards, filters, the HCP list view) currently assume `"active"` means "doctor is a working partner" rather than "doctor's account technically exists"?
- [ ] Should resending invalidate a still-unexpired previous token (if an admin resends before the 7 days are up), or can both tokens remain valid until whichever is used or expires first?
- [ ] What exact UI signal should tell an admin "this doctor's invite expired, nudge them again" — a status badge, a column in the HCP list, something on the detail page only? Nothing today surfaces `invite_tokens` state anywhere in the UI.
- [ ] Should there be a cooldown (e.g. can't resend more than once per N minutes/hours) to prevent accidental spam?

### Hand-off
→ `/arch assess practitioner-invite-resend` — the status-semantics question is a real cross-cutting data-model decision (what `practitioner.status` means, whether a new field is needed), not just a small bolt-on; needs a design pass before `/dev` implements it.
