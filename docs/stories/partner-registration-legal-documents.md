## Refined User Story: Partner Registration — Real Legal Documents & Existing-Data Reuse

**Classification**: feature
**Raw input**: Rework the partner (HCP/doctor) self-registration completion screen (`PartnerRegistrationView.vue`, `/partner-register?token=...`). Strip the form to password + confirm password + signature only; remove the clinic name/RFC/billing-address input fields. Replace the two placeholder "view document" dialogs with the real GDPR/data-protection consent (adapted from the live privacy policy at neosleepcare.com/privacy) and a real collaboration agreement (the actual contract between NeoSleep and the partner doctor — terms to be supplied by Łukasz, not invented). The doctor's clinic/company info should no longer be re-typed here — it should be pulled from the organization/practitioner records the rep/KAM already captured, then shown both inside the signed PDF and in a new "Documents" tab on the doctor's detail view. Fix a reported "form cannot be scrolled" bug. Separately: check status of "consentimiento informado" (patient informed consent) — confirmed not implemented anywhere; flagged as its own future story, out of scope here.

### As a doctor (HCP) completing partner registration, I want to set my password and sign one real, personalized contract and consent document — pre-filled with the clinic data NeoSleep already has on file — so that finishing onboarding is fast and I'm not asked to re-enter information a rep already collected, or to sign placeholder text.

### Stakeholder Notes
- 👤 User: The doctor's job here is "finish onboarding, trust what I'm signing." Today's workaround is re-typing clinic name/RFC/billing address (already captured by the inviting rep via the HCO/HCP forms) and clicking past two dialogs that currently show placeholder text, not a real agreement.
- 🏢 Client: The tenant (pharma company) benefits from lower partner-onboarding drop-off, a real dated/personalized signed contract per partner instead of a blank checkbox, and — via the new Documents tab — an auditable record they can point to for their own compliance reporting.
- 🩺 Patient: No downstream effect. This is doctor/partner onboarding paperwork, not a clinical or treatment-consent flow. (Contrast with the separately-flagged patient informed-consent item below, which *is* patient-facing and is explicitly out of scope for this story.)
- 🚀 NeoCRM/Platform: The mechanism (render a personalized PDF from already-captured entity data, store as `file_attachment`, surface in a Documents tab) is reusable white-label infrastructure — worth building the document *template* as config/i18n-driven text rather than hardcoding NeoSleep's own wording, so a future tenant can swap in their own consent/agreement copy without a code change.
- ⚖️ Compliance: Real flag, two distinct concerns. (1) The GDPR/LFPDPPP data-protection consent text must actually match what's collected/processed — should mirror the live privacy policy, personalized, not aspirational placeholder copy. (2) The collaboration agreement is a binding commercial contract; its terms must come from Łukasz (and likely counsel), never invented by the assistant. Canvas/simple e-signatures are legally recognized for ordinary business contracts in both Poland (eIDAS "Standard Electronic Signature" tier) and Mexico (Código de Comercio — valid without a NOM-151 certificate), but sit at the *lowest* evidentiary tier in a dispute — worth flagging explicitly rather than silently treating a canvas pad as sufficient forever.

### Medical-Industry Trend Check
- n/a — internal/administrative partner-onboarding flow, not a clinical, PCF, or HCP-engagement design question.
- Compliance data points gathered instead: eIDAS standard/advanced/qualified e-signature tiers apply in Poland ([PandaDoc](https://www.pandadoc.com/electronic-signature-law/poland/)); simple electronic signatures are valid under Mexico's Código de Comercio without a NOM-151 conservation certificate, though NOM-151 strengthens evidentiary weight in litigation ([ZapSign](https://zapsign.co/legal-validity/mexico), [Verificamex](https://verificamex.com/firma-electronica/nom-151)).

### Acceptance Criteria
- [ ] `PartnerRegistrationView.vue` shows only password, confirm password, and the signature pad as inputs; clinic name/RFC/billing-address fields are removed from this screen.
- [ ] The two "view document" links show the real GDPR consent and collaboration-agreement text (i18n/config-driven per CLAUDE.md rule 3, not hardcoded in the component), pre-filled with the invited doctor's name and their existing organization/practitioner data — not re-typed by the doctor.
- [ ] `AcceptPractitionerInviteCommand` stops accepting/storing `clinicName`/`taxId`/`billingAddress` from the request body; it reads that data from the organization/practitioner records already linked to the invite.
- [ ] The generated signed PDF (`partnerDocuments.ts`) renders the doctor's actual clinic name/RFC/billing address (from the DB) into the document body, and the signing-language text follows the signer's own locale (en/pl/mx) instead of the current hardcoded Polish strings.
- [ ] `HCPDetailView.vue` gains a "Documents" tab listing the practitioner's signed `file_attachment`/`consent` records (via the existing but currently-unused `getFileAttachmentsForEntity`), each showing the clinic/company info captured at signing time plus a way to view/download the signed PDF.
- [ ] A practitioner route exposes those documents to the pwa, RBAC-gated the same way other practitioner data is.
- [ ] The "cannot scroll" bug is fixed against a verified repro (device/browser identified), with a regression check confirming scroll works afterward — not a guessed fix shipped blind.
- [ ] i18n keys added to `en.json` first, then `pl.json`/`mx.json` (CI parity enforced); no hardcoded user-facing strings.
- [ ] Both document texts (GDPR consent, collaboration agreement) are reviewed and explicitly approved by Łukasz before this ships to prod.

### Open Questions — RESOLVED (answers from Łukasz, 2026-09-15)
- [x] Compensation model: none in the contract yet. Future model (not in v1 of the agreement): doctors pay NeoSleep per NOA (OrthoApnea) device dispensed to their patients — to be added later as a separate clause/amendment once defined.
- [x] Doctor's obligations: none beyond what's implicit in using the platform — no exclusivity/response-time/co-branding clauses in v1.
- [x] Term & termination: indefinite/unlimited duration; either party may terminate (simple clause for v1); revisit/amend later as needed.
- [x] Confidentiality/IP/data ownership: NeoSleep is the data/platform owner.
- [x] Liability: kept deliberately general/minimal for v1 — no detailed indemnification language.
- [x] Legal counsel review: not before go-live — Łukasz approves the content directly for MVP; real counsel review deferred.
- [x] Governing law/jurisdiction: two separate versions, one under Polish law for PL partners, one under Mexican law for MX partners.
- [x] Patient informed-consent scope: IN SCOPE now, not deferred. Łukasz already has a built HTML→PDF template (`NeoSleep_Consentimiento_DAM_plantilla.html`, provided) for the DAM informed-consent document, generated per patient (name, treating doctor, place, date fields; signature box left empty for a canvas signature to be added later — a full e-signature flow for patients is explicitly future work, v1 is PDF-generation-only, shown/downloadable from a new "Documents" tab on the patient detail view, mirroring the doctor's Documents tab from this same story).
- [x] Reference content for the collaboration agreement's tone/structure: Łukasz provided two OrthoApnea PDF documents (`OA134-24v1` clinical inclusion-criteria protocol, `OA020_22v1` clinic protocol / ApneaDock account & device-ordering guide) as style/structure references — NeoSleep's collaboration agreement should be "similar, mainly in content [style/structure], but adapted to our needs" — i.e., match the clear, structured, disclaimer-conscious tone of these documents, not their literal legal content (they are clinical/operational protocols, not commercial contracts).
- [x] Document template/design: the provided informed-consent HTML (NeoSleep-branded: Poppins font, `#409183` primary/`#4A4A49` secondary palette, logo header, structured field-rows, empty `.signature-box` for a canvas signature image, Puppeteer/Playwright `page.pdf()` footer template with NeoSleep contact info + doc-ref code like `NSL-CI-DAM v1`) is explicitly intended by Łukasz as the shared base template for all three generated documents in this effort: patient informed consent (already built), doctor GDPR/data-protection consent, and the doctor collaboration agreement — each gets its own content but the same visual system and PDF-rendering mechanism.

### Scope addition (2026-09-15): country-specific public privacy policy
Łukasz separately requested that the public privacy policy at neosleepcare.com/privacy also get PL/MX variants, not just the internally-generated GDPR-consent document. Current state (confirmed via research): `apps/web/src/views/PrivacyView.vue` renders ONE generic multi-jurisdiction text (`website.privacy.s1..s8` keys in `packages/i18n/{en,pl,mx}.json`) that already name-checks GDPR/EU, LFPDPPP/Mexico, and PDPA/Thailand inline within the same paragraphs, translated three ways — not legally distinct per market.

Decisions confirmed by Łukasz:
- [x] The public page itself gets real PL/MX variants (not just the internal GDPR-consent PDF content) — same two-variant pattern as the collaboration agreement.
- [x] The PL vs MX difference is a genuine legal difference (GDPR/EU basis + rights for PL, LFPDPPP basis + rights/ANPD-equivalent for MX), drafted as two separate documents — not a translation of one shared text.
- [x] Variant selection reuses the site's existing language switcher as a proxy for country (`locale=pl` → GDPR/PL variant, `locale=mx` → LFPDPPP/MX variant), rather than building new country-detection/selector UI. Known limitation accepted: language ≠ country (e.g. a Mexican visitor browsing in English won't get the MX variant) — `locale=en` falls back to a generic/default variant (today's existing blended text, kept as-is for `en`, unless Łukasz says otherwise later).

Not yet scoped/estimated: this touches `apps/web` (separate FTP/GoDaddy deploy, distinct from the apps/api+apps/pwa work in this story) and needs its own content draft (two legally distinct policies) before implementation — treat as a related but separately-sequenced piece of work, coordinated with (not blocking) the collaboration-agreement content drafting already in this story, since the GDPR-consent document's personalized text is meant to mirror whichever privacy-policy variant applies.

### Architecture flag for /arch
The existing PDF pipeline (`apps/api/src/services/partnerDocuments.ts`) draws PDFs programmatically with `pdf-lib`. The newly-provided template is an HTML document meant to be rendered via headless-Chrome `page.pdf()` (Puppeteer/Playwright), which is a different rendering approach entirely (HTML/CSS template → PDF, vs. programmatic drawing). Reconciling these — replace `pdf-lib` with an HTML-rendering pipeline reused across all three documents, or keep `pdf-lib` and port the template's content/design into it — is a cross-cutting architecture decision (new dependency, rendering pipeline, template storage location) and needs `/arch` before implementation.

**RESOLVED (2026-09-16)**: decision made to replace `pdf-lib` with `puppeteer-core` + `@sparticuz/chromium` (matched Chromium 143 build, no postinstall-download step — avoids pnpm 9's default build-script block), behind a single seam `apps/api/src/services/documentRenderer.ts`. The Render free-tier memory risk this raised was spiked directly against the live `neosleep-bff` dev deploy before committing to the approach: cold start (first render, browser launch) ~19s / RSS 143→201MB; warm renders ~1-3s with RSS flat at ~202MB across 5 sequential calls and a burst of 4 concurrent ones (the seam's built-in max-2-concurrent-renders queue engaged correctly under the burst, visibly slowing the 3rd/4th call rather than spiking memory). No growth, no crashes — confirmed workable on the current free-tier single-process service. The temporary verification route (`internal-pdf-spike.ts` — "spike" used deliberately as the standard XP/Scrum term for this kind of throwaway technical-risk check) has been deleted now that it's answered; `documentRenderer.ts` is the permanent piece going forward.

### Decision (2026-09-16): doctor contact info on generated documents comes from HCP, not manual entry
Łukasz confirmed: wherever a document shows the treating doctor's name/phone/email (e.g. the patient informed-consent's "Especialista / médico tratante" field), that contact info must be sourced from the practitioner (HCP) record already in the CRM, not typed in ad hoc at generation time. A future (explicitly deferred, TODO) enhancement lets the user override with a different email/phone at generation time — not needed for v1. Relevant when building `GenerateInformedConsentDocumentCommand` (patient doc) and the practitioner-side document generation — pull `phone`/`email` from the practitioner/identity record alongside the name already planned.

### Hand-off
→ `/legal` — for the compliance-sensitive document content questions above (especially governing law/jurisdiction and liability/counsel-review status)
→ `/arch assess` — for the Documents-tab route + switching the data source from self-entered metadata to existing organization/practitioner records (cross-cutting DB read change)
→ `/dev` — for implementation once document content and architecture are settled

---

## Addendum (2026-09-16): review/edit UX for pre-filled clinic data, phone verification, post-sign email delivery, scroll bug still open

**Raw input (Łukasz, translated from Polish)**: The registration form should show only 2 password fields, then a phone number to confirm, then the clinic and its details for review (email, phone, address, Tax ID, clinic name — open to more if relevant) — this is for the doctor signing the agreement to check and correct anything wrong. Unsure whether these should be plain inputs or read-only fields with an edit-via-modal action, to avoid an accidental change slipping through while still allowing an intentional one — asked for a recommendation, not dictating the modal. Separately: the invite email should mention documents need an e-signature and recommend a phone or, better, a tablet with a stylus. After signing, the generated PDF should also be emailed to the practitioner and cc'd to alfred.jan@neosleepcare.com. The form still can't be scrolled, which blocks reaching the signature pad entirely. Asked whether document generation is genuinely not implemented yet or just queued elsewhere.

**Grounded current-state findings** (code investigation, 2026-09-16 — supersedes assumption):
1. **Scroll bug — still open.** `PublicLayout.vue`'s outer shell and `.partner-registration`'s own scroll container are both already set up correctly (the latter has a comment explaining it was added deliberately for this form). The likely actual culprit is `packages/ui/src/components/AuthCard.vue` (`.auth-card__viewport { overflow: hidden }`, height driven by a `ResizeObserver` measuring the mounted step) — a mismatch between observed and actual rendered height would clip content before the outer container ever sees real overflow to scroll to. Needs on-device confirmation before fixing blind, per this story's own existing acceptance criterion.
2. **Document generation is implemented, not a stub** — `partnerDocuments.ts` builds real pdf-lib PDFs and uploads them to Supabase Storage, retrievable via signed URL. What's *not* done: (a) it doesn't use the puppeteer/HTML-template pipeline decided on below/earlier this same day (spiked in isolation via `documentRenderer.ts`, not wired into this flow yet); (b) content isn't jurisdiction-aware — uses generic `documents.gdprConsent.*` even though localized `gdprConsentPl`/`gdprConsentMx` keys already exist unused in en.json; (c) the signature-block labels ("Podpisano przez:", "Data:") are hardcoded Polish regardless of the signer's locale. So "not well generated" is fair on localization/pipeline grounds, not on "doesn't work."
3. **No email is sent anywhere in this flow today.** `AcceptPractitionerInviteCommand` doesn't call the mailer after signing. Both the "send signed PDF to practitioner + cc alfred.jan@neosleepcare.com" ask and the e-signature-device email note are net-new, not extensions of an existing recipient list.
4. **Current form still matches the screenshot** — clinicName/taxId/billingAddress are still free inputs; the original story's resolution (strip to password+confirm+signature, pull clinic data from existing HCO/HCP records) hasn't been implemented yet. Today's request refines rather than reverses that decision: show the pulled-from-existing-records data for review (read-only by default) with a deliberate, hard-to-misfire edit path — this *is* that not-yet-built piece, now with the review/edit-safety detail added.

### Stakeholder Notes — new slices only

**A. Clinic-detail review/edit UX + phone verification**
- 👤 User: the doctor is reviewing data a rep entered on their behalf before signing a binding document, often on a phone, in their first real interaction with the platform — needs confidence the data's right and confidence they can't fat-finger a change mid-flow.
- 🏢 Client: fewer disputes over "the signed agreement had the wrong clinic name/tax ID"; a corrected-but-tracked field matters for the tenant's own compliance story.
- 🩺 Patient: no downstream effect — onboarding paperwork, not treatment.
- 🚀 Platform: read-only-with-guarded-edit is a reusable pattern for any future pre-filled-data review step (HCP portal, other tenants) — worth a shared component, not one-off.
- ⚖️ Compliance: any edit made here, before a legal signature, should be audit-logged (who changed what field, old/new value) — same standard as other consent-adjacent flows in this codebase.

**B. Post-signing document email delivery**
- 👤 User: doctor gets a copy for their own records without asking support.
- 🏢 Client: flag — `alfred.jan@neosleepcare.com` is a NeoSleep-internal address, not tenant-specific. Hardcoding it in shared/white-label code would leak NeoSleep's own operational email into what CLAUDE.md rule 2 (Views vs Data separation) says should be config-driven, once a second tenant exists. Fine as an interim env var for the current single-tenant MVP — same precedent as the linear-worker's interim `DATABASE_URL` storage — flagged as temporary, not the final shape.
- 🩺 Patient: none.
- 🚀 Platform: needs to become tenant-configurable (`app_config`) before a second tenant partner-onboards — defer that build until it's actually needed.
- ⚖️ Compliance: emailing a signed PDF with tax-ID + personal data via a plain attachment (Resend) — sanity-check retention/DPA coverage; flag to `/legal`, but don't block MVP on it since Resend is already the approved provider for other personal-data-bearing email (password reset, lead offers).

### Acceptance Criteria (additive to the existing ones above)
- [ ] Phone number is one of the pre-filled, reviewable clinic-detail fields (no retype-confirm, no OTP — a single field is sufficient per Łukasz's 2026-09-16 answer).
- [ ] Clinic details (name, email, phone, address, Tax ID) are pre-filled from the existing organization/practitioner record — not re-typed — shown read-only by default.
- [ ] A single "Edit details" button opens one modal containing the full clinic-details group; the edit only commits on explicit confirm inside the modal, never live-as-you-type on the read-only view.
- [ ] Any pre-sign edit to clinic details is written to `audit_log` with old/new value + `identity_id`.
- [ ] Invite email copy gains an i18n-driven note recommending a phone, or preferably a tablet with a stylus, for the signature step (en.json first, then pl/mx).
- [ ] On successful signing, the signed PDF(s) are emailed to the practitioner's registered email via `mailer.ts`/`@neo/email`, cc'ing a configurable compliance address (interim: env var, defaulting to alfred.jan@neosleepcare.com).
- [ ] Email delivery failure doesn't roll back or block the signing transaction; failure is logged.
- [ ] Scroll bug fixed against a confirmed on-device repro (root cause likely `AuthCard.vue`'s ResizeObserver-driven viewport, per finding above) — not a guessed fix shipped blind.

### Open Questions — RESOLVED (answers from Łukasz, 2026-09-16)
- [x] Phone "confirmation": a single phone-number field is enough for now — no retype-confirm, no OTP/SMS. Just capture it as one of the reviewable clinic-detail fields.
- [x] Review/edit interaction pattern: single "Edit details" button opens one modal containing the whole clinic-details group (name/email/phone/address/Tax ID); fields stay read-only outside the modal, save only commits on explicit confirm inside it.
- [x] PDF pipeline for this slice: ship on the current pdf-lib pipeline now (mail delivery + cc unblocked immediately); jurisdiction-aware content and the puppeteer/HTML pipeline swap stay a separate follow-up, not a blocker here.
- [ ] Any clinic fields worth showing beyond name/email/phone/address/Tax ID? Left open by Łukasz.
- [ ] Confirm `alfred.jan@neosleepcare.com` as an interim env var (not per-tenant config yet) — assumed yes given single-tenant MVP state elsewhere in this project.

### Hand-off
→ `/ux` — review/edit interaction pattern, phone-verification UX
→ `/legal` — signed-PDF-by-email data retention sanity check
→ `/arch assess` — audit log on pre-sign edits; jurisdiction-aware PDF content reusing existing unused i18n keys; whether to adopt the puppeteer pipeline now or ship this slice on pdf-lib first
→ `/dev feat` — scroll-bug repro+fix, form UX, email delivery, once the above are settled
