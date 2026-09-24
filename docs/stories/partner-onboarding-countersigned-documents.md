## Refined User Story: Partner onboarding — countersigned agreement + GDPR e-signature

**Classification**: feature. It replaces the consent mechanism in a legally binding onboarding flow: checkbox acceptance becomes a per-document drawn signature against a counter-signed document. It also changes the PDF pipeline and adds a new document template. This is not a copy tweak.

**Linear**: NEO-51 (see ticket for the visual flow artifact)

**Raw input** (Łukasz, translated from Polish, 2026-09-24): "When we invite a doctor to the platform, they get an email with a CTA, and there's the edit-details form (it's great, only the edit button should be more visible — outline?). There are 2 checkboxes with agreements. Both should be signed (the CEO signature I will deliver, the doctor's signature we collect from a signing input). The document gets dates, then it is sent to both parties, NeoSleep and the doctor, with both documents attached (agreement and GDPR). Instead of checkboxes, a signature. The form has: password, edit details, and 2 buttons that open the agreement and the GDPR document. There the document is already signed by NeoSleep, with a field for the doctor's signature. After signing there's a Finish button (there must also be a button to clear the input, ideally right next to the signing field). Submit and it gets processed. The doctor gets a confirmation with the documents attached by email. Then the doctor goes back to the login view and logs in with the new credentials. The end. Remember we already have agreement templates in the Documents tab."

### As an invited doctor (partner), I want to read each agreement exactly as NeoSleep has already signed it and sign it myself on my phone or tablet, so that I finish onboarding with a legally meaningful, countersigned copy of both documents in my inbox and can log straight in.

### Current state (grounded, 2026-09-24)
Most of the pipeline already exists. This story is a **delta**, not a rebuild.
- `/partner-register` → `apps/pwa/src/views/PartnerRegistrationView.vue`: password ×2, read-only clinic details with an "Edit details" button (`AppButton variant="text" size="small"`, L72-74) that opens an edit modal, **2 `VCheckbox`es** (GDPR + agreement, L89-104) whose "View document" dialogs show **plain i18n text**, and **one shared `SignaturePad`** (L106) for both documents.
- `AcceptPractitionerInviteCommand` (`apps/api/src/commands/invitePractitioner.ts:275-450`): sets password (bcrypt), activates user and practitioner, and renders both PDFs with **pdf-lib** (`apps/api/src/services/partnerDocuments.ts`). The PDFs are plain Helvetica with a hardcoded Polish "Podpisano przez:" and **no NeoSleep signature**. The command also uploads to Supabase, writes `file_attachment` + `consent` + `audit_log`, and marks the token used.
- `invite.ts:83-87` already emails both PDFs as attachments to the doctor, CC'd to `PARTNER_DOCS_CC_EMAIL` (NeoSleep), fire-and-forget.
- Documents tab (`packages/documents`): `gdprConsent.pl` / `gdprConsent.mx` templates exist and are admin-editable with versioning (`platform.document_content_version`). **There is no partner-agreement template.** It exists only as the i18n key `documents.partnerAgreement.body`.
- The Puppeteer HTML→PDF renderer (`apps/api/src/services/documentRenderer.ts`) is live for Historia Endo and STOP-Bang, and stamps `content_version_id`. The invite flow doesn't use it yet (the follow-up deferred on 2026-09-16 in `partner-registration-legal-documents.md`).
- Login: email + password, remember-me (30 days). No passkeys.

### Decisions (Łukasz, 2026-09-24)
| Question | Decision |
|---|---|
| Signature scope | **Per document.** Each document has its own dialog, signature pad and Clear button. |
| "Keypass" at login | **Email + password is enough.** Passkey/WebAuthn is out of scope; separate ticket later. |
| Agreement template | **New `partnerAgreement.pl` + `partnerAgreement.mx`** in the Documents manifest, admin-editable. Seed v1 from the current i18n text; Łukasz pastes the final legal text in the editor. |
| PDF engine | **Switch to Puppeteer + HTML templates.** The dialog preview and the final PDF are the same document (WYSIWYG), stamped with `content_version_id`. |
| CEO signature storage | **Private Supabase bucket.** PNG never in the repo or the frontend bundle. The signatory's name and title are tenant-configurable (`app_config`, falling back to env). |
| Dates | **Separate dates.** NeoSleep's signature date = the date the invite was activated/sent. The doctor's signature date = server time at Finish. |
| After Finish | **Success screen + "Go to login" CTA**, which opens `/login` with the email prefilled. No auto-login. |
| Worktree | Main tree for docs + ticket; a `neo-51-…` worktree when implementation starts. |

### Stakeholder Notes
- 👤 User (doctor): this is their first real contact with the platform, often on a phone. Today they tick a box under a text blob and sign once, "somewhere below". The new flow makes it obvious what they're signing (the real document, already signed by NeoSleep) and gives each signature its own clear/redo action.
- 🏢 Client (tenant): a countersigned PDF on both sides replaces "clicked a checkbox". That is a much stronger artifact in a dispute and for the tenant's own partner-compliance files. Signatory name, title and signature image must be per-tenant config, not NeoSleep-hardcoded, or the white-label story breaks at tenant #2.
- 🩺 Patient: no direct effect. Indirectly, only activated partners with signed GDPR/DPA terms get access to patient-adjacent workflows, so the gate stays as strict as today.
- 🚀 NeoCRM/Platform: moving the invite flow onto the Puppeteer + versioned-template pipeline removes the second, divergent PDF path (pdf-lib). "Counterparty pre-signed template + signer pad" is a reusable pattern (patient informed consent next).
- ⚖️ Compliance: a drawn signature is a **simple electronic signature** (eIDAS SES in the EU; a "firma electrónica simple" analogue in MX). Its evidential weight comes from the audit trail: IP, UA, timestamp, content version + hash, and the invite-token-bound identity. Flag to `/legal` whether SES is sufficient for the partner agreement in PL and MX, or whether a qualified/advanced signature is required. Also: the **CEO's signature image is a sensitive asset**. Store it in a private bucket, serve it only inside token-gated previews and generated PDFs, never as a public URL.

### Medical-Industry Trend Check
n/a. This is an internal onboarding/legal-paperwork flow, not an HCP-engagement or PCF pattern. The only external question (signature legal validity per market) belongs to `/legal`, not to a trend search.

### Acceptance Criteria
**Form (pwa `/partner-register`)**
- [ ] The "Edit details" button is visually prominent: outlined variant with a pencil icon, same height as other secondary actions, still opening the existing edit modal (no behavior change).
- [ ] Both `VCheckbox`es are removed. A "Documents to sign" section shows 2 document rows (Partner agreement, Data protection consent), each with a status chip (`To sign` / `Signed`) and a button (`Read & sign` / `View / re-sign`).
- [ ] Each button opens a dialog (full-screen below 600px, scrollable) that renders the **real template** for the practitioner's jurisdiction (PL → `*.pl`, MX → `*.mx`) at its **current content version**, prefilled with doctor name, clinic name, tax ID and address.
- [ ] Inside the dialog, the **NeoSleep signature block is already filled**: CEO signature image, signatory name + title, and the NeoSleep signing date (= invite activation date).
- [ ] The doctor's signature block has a signature pad with a **Clear button placed directly next to / on the pad**. It also shows the doctor's name and "Date: on submission".
- [ ] "Sign" in the dialog is disabled while the pad is empty. On Sign, the dialog closes, the row flips to `Signed` and shows a small signature thumbnail.
- [ ] The primary button is labelled **Finish**. It stays disabled until both passwords are valid and **both** documents are signed. An inline hint says which item is still missing.
- [ ] All new copy is in `en.json` first, then `pl.json` / `mx.json` (CI parity).

**Server**
- [ ] New templates `partnerAgreement.pl.html` / `partnerAgreement.mx.html` + manifest entries. v1 content is seeded from the current `documents.partnerAgreement.body`, and the templates are editable in the Documents tab like `gdprConsent.*`.
- [ ] All 4 templates (partner agreement + GDPR, PL + MX) share a two-party signature block partial with `data-field`s for both signatures, names, titles and both dates.
- [ ] A token-gated preview endpoint (e.g. `GET /api/v1/invite/document?token=&type=`) returns the rendered HTML with the counterparty signature embedded. It returns 404/410 for an invalid, expired or used token.
- [ ] Activating an invite stores the NeoSleep signing timestamp on the invite (`invite_tokens.metadata.counterparty_signed_at`). A resend produces a new token with a new date.
- [ ] `POST /api/v1/invite/accept` takes **two** signatures (`agreementSignature`, `gdprSignature`) plus the `content_version_id` each was signed against. If an admin published a newer version in the meantime, the request is rejected with a clear "document was updated, please re-read and sign" error.
- [ ] PDFs are rendered via `documentRenderer.ts` (Puppeteer), not pdf-lib. `partnerDocuments.ts`'s pdf-lib renderer is removed once nothing uses it.
- [ ] Each `file_attachment` + `consent` row records `template_key`, `content_version_id`, SHA-256 of the PDF, `counterparty_signed_at` and `signer_signed_at`.
- [ ] The CEO signature PNG loads from a private Supabase bucket path. Signatory name, title and path are read from tenant `app_config`, with an env fallback. If the signature is missing, activation of new invites fails loudly; it must never silently produce a PDF without the counterparty signature.
- [ ] The confirmation email to the doctor attaches **both** countersigned PDFs, and NeoSleep receives the same (CC / `PARTNER_DOCS_CC_EMAIL`). Email failure doesn't roll back signing (unchanged behavior).

**After Finish / login**
- [ ] A success screen says the documents were sent to `<email>` and offers "Go to login", which opens `/login` with the email prefilled.
- [ ] The doctor logs in with email + the password set in the form. Integration test: accept → login returns a session for role `doctor`.
- [ ] Integration tests (real DB, no mocks) cover: accept with 2 signatures, a stale `content_version_id` rejected, a missing counterparty signature config, and consent/attachment metadata written.

### Legal review (`/legal`, 2026-09-24)
> Not a substitute for counsel. The final agreement text should still be reviewed by a PL lawyer and a MX lawyer before go-live.

**Legal entities on the documents** (from `packages/documents/src/documentRender.ts:73-81`):
- PL: *Ostrowski Investment sp. z o.o.* (KRS 0001166320)
- MX: *AJ Management — Alfredjan de Jesús Díaz Urdaneta* (natural person, RFC DIUA8208043U7)

**Verdict per document and market**

| Document | PL / EU | MX |
|---|---|---|
| **Partner agreement** (B2B) | ✅ **Sufficient, with guardrails.** A drawn SES meets **documentary form** (KC art. 77²). Freedom of form applies (KC art. 60), and eIDAS art. 25(1) says an e-signature can't be denied effect just because it is electronic. It does **not** meet written form (KC art. 78 needs a handwritten signature or a QES). So the agreement text must not require written form ad solemnitatem, and its amendment/termination clause should say "documentary form", not "written form under pain of nullity". | ✅ **Sufficient.** Código de Comercio arts. 89-93 (data messages, simple firma electrónica) and Código Civil Federal art. 1834 bis (written form via electronic means). NOM-151-SCFI-2016 conservation (a PSC timestamp certificate) strengthens evidence in court. **Recommended later, not required for MVP.** |
| **Data protection document** | ✅ A signature is **more than enough**. GDPR art. 7(1) only requires that we can *demonstrate* consent. ⚠️ **But the legal instrument is probably wrong**, see below. | ✅ Professional data isn't sensitive, so a privacy notice (*aviso de privacidad*) plus tacit or express consent is enough (LFPDPPP 2025). A drawn signature satisfies even express written consent. ⚠️ Same instrument caveat. |

**Findings that change the build**
1. **The counterparty signature authorises text, not a template slot. HIGH.** As designed, any admin who edits `partnerAgreement.*` in the Documents tab would instantly get the Director's signature on text he never saw. **Guardrail:** the counterparty signature is applied **only to content versions explicitly approved by the signatory**. If the current version isn't approved, the preview and accept endpoints refuse. The approval mechanism (columns on `document_content_version` vs an `app_config` key) is a `/arch` decision.
2. **Representation. HIGH (PL).** The PL counterparty is Ostrowski Investment sp. z o.o. Alfred Jan Díaz can sign for it only if he is a management-board member with sole representation per KRS, or holds a **written power of attorney** (*pełnomocnictwo*). In MX the counterparty *is* Alfred himself (persona física), so the signature block must carry his **legal name**, *Alfredjan de Jesús Díaz Urdaneta*, not "Alfred Jan Díaz". The signature block therefore varies per jurisdiction: name, capacity ("Director, acting under power of attorney" vs own name) and entity.
3. **Pre-applied signature image.** Legally, a pasted image is also only SES/documentary form, not a handwritten signature. That's fine given verdict 1, but it needs:
   - a **one-page written authorisation from Alfred** (kept off-platform) allowing automated application of his signature to approved partner-document versions;
   - the PNG stored in a **private bucket only**, never at a public URL, never in the repo or the frontend bundle. Locally it sits in the gitignored `secrets/signatures/` until it is uploaded;
   - server-side rendering only. The token-gated preview may embed it (the doctor receives it in the PDF anyway), but no endpoint returns the raw file.
4. **"GDPR consent" is likely the wrong instrument. MEDIUM, do not block MVP.** For a partner's own data, the lawful basis is contract (art. 6(1)(b)) or legitimate interest, backed by an **information notice** (art. 13). Consent made a condition of partnership risks being invalid as not freely given (art. 7(4)). Separately, if doctors enter **patient** data into the platform, the doctor is controller and NeoSleep is processor. That needs an **art. 28 DPA** (in MX, a *remisión* contract with the *encargado*), not a consent. Today `consent.legal_basis` is hardcoded to `"consent"` (`invitePractitioner.ts:413`). → Follow-up ticket: restructure the second document into *Information notice + DPA*. NEO-51 keeps it as is, but stores the correct `legal_basis` once decided.
5. **Evidence bundle to retain per signing:**
   - the final PDF and its SHA-256;
   - `template_key` + `content_version_id` (the version text is immutable);
   - `counterparty_signed_at`, `signer_signed_at` (server UTC);
   - IP, user agent, request id;
   - invite token id (not the raw token), plus the recipient email the token was sent to;
   - the Resend message id of the delivery email.

   Retention: **agreement term + 10 years** (a conservative cover for the PL and MX limitation periods; confirm with counsel).
6. **Intent statement above the pad** (i18n): "By signing, I accept «{document title}» (version {n}) as shown above." This strengthens attribution for an SES.

**Additional acceptance criteria from the legal review**
- [ ] Counterparty signature renders only on a content version the signatory approved. The preview and accept endpoints return an error if the current version is unapproved. Integration test included.
- [ ] Signature block per jurisdiction: PL shows *Alfred Jan Díaz, Founder & Director, for Ostrowski Investment sp. z o.o.* (capacity wording confirmed after the KRS / power-of-attorney check); MX shows *Alfredjan de Jesús Díaz Urdaneta*.
- [ ] An intent statement above the doctor's pad names the document title + version.
- [ ] The evidence bundle (finding 5) is persisted in `consent.metadata` / `file_attachment.metadata` / `audit_log`, and there is no raw-signature-PNG endpoint.

### Answers (Łukasz, 2026-09-24, round 2)
- [x] **Signatory:** Alfred Jan Díaz, Founder & Director. Transparent PNG (712×308, RGBA) delivered and stored in the gitignored `secrets/signatures/counterparty-alfred-jan-diaz.png`. To be uploaded to the private bucket during implementation.
- [x] **NeoSleep-side recipient:** alfred.jan@neosleepcare.com via `PARTNER_DOCS_CC_EMAIL`. Confirmed.
- [x] **`/legal` check:** done, see above.

### Round 3: document set restructured (Łukasz + `/legal`, 2026-09-24). **Supersedes** the "2 signed documents" wording above.

**Patient-data roles (Łukasz):** the doctor decides about their patients; NeoSleep is the tool. So the **doctor = controller** and **NeoSleep = processor** (GDPR art. 28; in MX, NeoSleep is the *encargado* and the transfer is a *remisión*). A **data processing agreement (DPA, PL "umowa powierzenia") is mandatory before a doctor adds a first patient**, so it belongs in onboarding.

**Documents at onboarding (final):**

| # | Document | Contents | Doctor action | Legal basis |
|---|---|---|---|---|
| 1 | **Partner agreement + Annex 1: DPA** (one PDF) | Collaboration terms + art. 28(3) processor clauses: subject, duration, nature/purpose, patient data categories (incl. health data, art. 9), the doctor's instructions, confidentiality, security (art. 32), sub-processors (Supabase, Render, Resend, …) with prior general authorisation, assistance with data-subject rights, breach notification, deletion/return at end, audits. MX annex: *encargado* obligations under LFPDPPP 2025. | **Draw signature** (one signature covers the agreement and annex). NeoSleep pre-signed. | Contract (art. 6(1)(b)) |
| 2 | **Information notice** (PL "klauzula informacyjna", art. 13 GDPR; MX *aviso de privacidad integral*) about the **doctor's own** data | Controller identity, purposes, bases (contract + legitimate interest; **no consent language**), retention, recipients, rights, supervisory authority (PL: UODO; MX: Secretaría Anticorrupción y Buen Gobierno, which replaced INAI under the March 2025 LFPDPPP) | **"I have read it"** acknowledgement. No signature: the law requires delivery, not agreement. | n/a (information duty) |

**Why not one document:** allowed if the notice is clearly separated, but GDPR art. 12 transparency and EDPB guidance favour keeping the notice distinct from contract terms. Two items in the UI keeps it readable and still needs only one drawing on a phone.

**Signatories (counterparty, fixed per jurisdiction, never the inviting user):**
- **PL:** Łukasz Janusz Ostrowski, for Ostrowski Investment sp. z o.o. Signature block: **"Łukasz Ostrowski / NeoSleep"**. PNG at gitignored `secrets/signatures/counterparty-lukasz-janusz-ostrowski.png` (974×384 RGBA).
- **MX:** Alfredjan de Jesús Díaz Urdaneta. Signature block: **"Alfredjan Díaz / NeoSleep"** (same pattern). PNG at `secrets/signatures/counterparty-alfred-jan-diaz.png`.
- The **legal identification** (full legal name, entity, KRS/RFC, capacity "reprezentowana przez…") goes in the **parties clause** at the top of the agreement, not in the signature block. The short block is fine as long as the header identifies the party fully.
- The **version approver = the jurisdiction's signatory**: PL template versions are approved by Łukasz, MX by Alfred.
- Who can send invites: admin + manager only. Already enforced by `requireRole("admin","manager")` on `POST /practitioner/:id/activate` (`apps/api/src/routes/practitioner.ts:316-318`) and `canActivate` (`apps/pwa/src/views/HCPDetailView.vue:320`). No change needed, but add a regression test.

**Documentary-form clause (drafting requirement for the final agreement text):**
- The agreement is concluded in documentary form (PL KC art. 77²) by electronic signatures on the NeoSleep platform, and the parties accept this as binding.
- Amendments, termination and notices require documentary form (e-mail from the addresses in the agreement, or a statement on the platform). **Never** "written form under pain of nullity".
- MX: concluded by electronic means per Código de Comercio arts. 89-114 and CCF arts. 1803 / 1834 bis; the simple e-signature has the same effect as a handwritten one.
- The current placeholder `documents.partnerAgreement.body` contains **no** written-form clause, so there is nothing to remove today. The seeded v1 of `partnerAgreement.*` must include this clause, and the final text from Łukasz must keep it.

**Build changes vs the ACs above:**
- [ ] Replace "Documents to sign" with **2 rows**: (1) *Partner agreement + DPA* → `Read & sign` (dialog + pad + Clear, as designed); (2) *Information notice* → `Read` → dialog with an "I have read the information notice" confirm button, and the row shows `Read ✓`. Finish requires the signature **and** the acknowledgement.
- [ ] New templates: `partnerAgreement.{pl,mx}`, `partnerDpa.{pl,mx}` (rendered as Annex 1 inside the agreement PDF, separately editable), `partnerPrivacyNotice.{pl,mx}`. `gdprConsent.{pl,mx}` are deprecated: hidden from the picker, kept for rendering already-signed historical records.
- [ ] Privacy-notice content fixes vs the current `gdprConsent*` text: remove "I consent / wyrażam zgodę" and "voluntary but necessary" (invalid under art. 7(4)); MX: replace the INAI reference with the current authority.
- [ ] Records: agreement → `consent` row with `legal_basis = 'contract'`, purpose `partner_agreement_dpa` (already allowed by the CHECK in `001_tenant_schema.sql:1142`, so no migration). Notice → **no consent row**; `audit_log` `acknowledge_privacy_notice` + `file_attachment` of the rendered notice PDF with version + hash.
- [ ] Email to the doctor + CC alfred.jan@: agreement+DPA PDF (countersigned) + notice PDF.
- [ ] Signatory config per jurisdiction: `{ printedName, pngPath, approverUserId }` for PL and MX.

### Round 4: drafting answers (Łukasz, 2026-09-24)
Draft v1 texts (PL + MX: agreement, DPA annex, privacy notice) are in the "NEO-51 Partner Agreement Drafts" artifact linked on the ticket. **Approved by Łukasz on 2026-09-24.** They are seeded as template version 1. The texts stay out of the repo until then, because non-English text belongs only in i18n files and seed data (CLAUDE.md).
- Subject: platform for OSA patients on MAD/NOA, device ordering, training. Access is free; NOA device fees come later via an annex. Indefinite term with **30 days' notice**.
- NeoSleep owns the platform, IP and materials; the **doctor controls patient data**. This replaces the 2026-09-15 "NeoSleep owns the data" note. The doctor is solely responsible for clinical decisions. Mutual confidentiality; liability limited to direct damage from intent or gross negligence.
- Parties:
  - PL: Ostrowski Investment sp. z o.o., Łąkowa 3, 77-127 Nakla, KRS 0001166320, NIP 8421798790, REGON 541401786, represented by Łukasz Janusz Ostrowski. Courts: the common court for the company's seat.
  - MX: Alfredjan de Jesús Díaz Urdaneta (AJ Management), RFC DIUA8208043U7, Veracruz 14 int. 2, Col. Roma Norte, Alcaldía Cuauhtémoc, C.P. 06700, CDMX. Courts: Mexico City.
- DPA: patient data categories confirmed. Breach notice within 48 h. 30-day export window after termination, then deletion.
- Sub-processors, with legal entities verified 2026-09-24:
  - Anthropic PBC (US);
  - **OpenRouter, Inc.** (New York, US). Łukasz confirmed it is sometimes used in production. It forwards to other model providers, so use ZDR endpoints for patient data and keep logging off. Its DPA applies to commercial use and should be filed in Drive "NeoSleep / Legal".
  - Supabase Inc. (US, **us-west-1**);
  - **Render Services, Inc.** (San Francisco, US). DPF-certified; our service runs in Frankfurt. Render's own sub-processors are AWS, GCP, Cloudflare and ClickHouse.
  - **Plus Five Five, Inc.** d/b/a Resend (US). Its DPA is pre-signed for every account.
- Privacy notice contact: alfred.jan@neosleepcare.com. No DPO (PL IOD) appointed.
- **Signature authorisation storage:** in-app "Approve & apply my signature" per content version (audit_log is the evidence), plus a one-page written authorisation from Alfred only, kept in Google Drive "NeoSleep / Legal" (restricted). Never in the repo.
- Flags to resolve before approval:
  - ~~AI sub-processors~~: resolved. Both Anthropic and OpenRouter are used, and both are listed.
  - Supabase us-west-1 means a US transfer of PL health data (lawful with DPF/SCCs; consider an EU region for PL later);
  - ~~Resend's legal entity~~: resolved, Plus Five Five, Inc.

### Round 5: practice relationship, licence number, per-country contacts (Łukasz, 2026-09-24)
**Owner vs employed.** If the doctor owns a private practice, they are the business party. If they work at a hospital or clinic, they only practise there.
- The doctor **chooses in the registration form**: "I own this practice" / "I work here". The default comes from `organization.type` (`practice` → owner; `clinic`, `hospital` → works here).
- Store the choice in `practitioner_organization.role` (`owner` | `staff`) for the primary organization. The column already exists as free text, so no schema change is needed.
- The agreement's party clause has **two variants**: A = owner (with NIP/RFC of the practice), B = practises at the facility (no facility tax ID).

**Employed doctors and patient data** (`/legal`): in a hospital or clinic, the controller of patient data is usually the facility, not the doctor. Decision: **the doctor declares it** in DPA § 1: either they are the controller of the patients they enter, or they are authorised by the facility to conclude the DPA on its behalf. The doctor is liable for the truth of that declaration. This is a pragmatic MVP choice; a facility-level DPA signed by the facility's representative is a possible later flow.

**Licence number on all forms.**
- PL: **numer prawa wykonywania zawodu (PWZ/NPWZ)**. 7 digits `KABCDEF`, where `K` = (1·A + 2·B + … + 6·F) mod 11. `K` ≠ 0, and a result of 10 is invalid. The same format covers lekarz and lekarz dentysta (source: NIL).
- MX: **cédula profesional**. 7 or 8 digits, issued by SEP/DGP. For specialty cédulas with letters (e.g. `AE-1234567`), keep only the digits.
- Storage: the existing `practitioner.national_ids` JSONB (`{pwz, cedula}`, already in the schema), so no new column.
- The HCP form's generic "National ID" field (`national_ids.primary`) is **replaced** by a country-dependent field: "Numer PWZ" (PL) / "Cédula profesional" (MX). A data migration (next free number, **028**) moves existing `primary` values to `pwz` or `cedula` by `country_code`, and leaves a value in place when the country is unknown.
- Forms to update:
  - `hcpForm.ts` (create/edit HCP);
  - `leadForm.ts` (doctor-type leads, optional there);
  - `partnerInviteForm.ts` (optional prefill);
  - the partner-register **Edit details** modal (the doctor confirms or corrects it; **required** before Finish);
  - the HCP detail view (display).
- Validation: client-side and server-side with the same rules (a shared validator in a package, not duplicated).
- The licence number is printed in the agreement's party clause and listed in the privacy notice's data categories.

**Per-country contacts.**
- Privacy contact: PL **lukasz.ostrowski@neosleepcare.com**, MX **alfred.jan@neosleepcare.com**.
- NeoSleep copy of signed documents: the same split (PL → Łukasz, MX → Alfred). This replaces the single `PARTNER_DOCS_CC_EMAIL` with a per-jurisdiction value, which fits the per-jurisdiction signatory config (`{ printedName, pngPath, approverUserId, ccEmail, privacyEmail }`).

### Open Questions
- [ ] **Final legal text** of the partner agreement (PL + MX). Łukasz says "coming soon". v1 is seeded from the current i18n body. Per [[feedback-dont-ship-open-questions-as-done]], the ticket doesn't move to Done while the v1 placeholder is live. The final text must avoid "written form under pain of nullity" clauses (legal finding, PL).
- [x] ~~PL representation~~: resolved. PL is signed by Łukasz, MX by Alfred.
- [x] Signature authorisations: in place (Łukasz, 2026-09-24).
- [x] **Draft v1 texts approved by Łukasz (2026-09-24).** They are seeded as version 1 of `partnerAgreement.*`, `partnerDpa.*` and `partnerPrivacyNotice.*`. A lawyer review is still recommended later, since health data (art. 9) is in scope.
- [x] MX authority: the LFPDPPP published 2025-03-20 (in force 2025-03-21) abolished INAI; private-sector data protection now sits with the **Secretaría Anticorrupción y Buen Gobierno** (sources: EY México, Hogan Lovells, KPMG MX). The MX notice must cite it instead of INAI. The new law's Reglamento is still pending, so re-check when it is published.

### Out of scope
- Passkeys / WebAuthn (separate ticket).
- Auto-login after Finish.
- Qualified/advanced e-signature providers (DocuSign, Autenti, etc.).

### Hand-off
→ `/legal`: SES sufficiency + agreement text
→ `/arch assess`: token-gated preview endpoint, private-bucket CEO signature, content-version race handling
→ `/ux`: document dialog + pad + Clear placement, mobile full-screen
→ `/dev feat` in worktree `neo-51-partner-countersigned-documents`

### Implementation (2026-09-24, branch `worktree-neo-51-partner-countersigned-documents`)
Design decision record: `docs/ADR-023-countersigned-partner-documents.md`. The "Current state" section above describes the code **before** this branch.

- **Licence number**
  - PL PWZ (mod-11 check digit) and MX cédula are validated by one shared validator (`@neo/documents` browser entry).
  - They appear on the HCP, lead and invite forms, on the HCP detail view, and in the registration edit dialog (required there).
  - Migration 028 moves the old `national_ids.primary` value into `pwz` or `cedula`.
- **Documents**
  - Three templates, `partnerAgreement` (with the DPA in `{{slot:annex}}`), `partnerDpa` and `partnerPrivacyNotice`, each with `pl` and `mx` locales.
  - The approved v1 texts are seeded by `apps/api/scripts/seedPartnerDocumentContent.ts`.
  - `gdprConsent.*` is hidden from the editor.
- **API**
  - Signatory config and approvals live in `app_config.metadata.partnerSignatories`.
  - Activation blocks the invite when the documents aren't ready, and stamps the countersignature date on the token.
  - Token-gated preview: `GET /invite/document`.
  - Accept takes one signature plus the notice acknowledgement plus the version ids; a stale version returns 409.
  - PDFs are rendered with Puppeteer and stored with the evidence bundle.
  - The email CC goes to the jurisdiction's inbox.
  - pdf-lib is removed.
- **PWA**
  - The checkboxes become two document rows and a `PartnerDocumentDialog` (the real document, NeoSleep's signature, a pad with Clear on it).
  - Edit details is an outlined button; the dialog adds the licence number and owner/staff choice.
  - Finish is gated on all steps being done.
  - Success screen, then `/login?email=` prefill.
  - The scroll bug is fixed (the card was a shrinking flex item).
  - The Documents editor has an approval banner.
- **Security fix found on the way:** invited doctors' logins got the shared initial password on every API start. They are now excluded, and password login rejects inactive accounts.

**Verified locally** (throwaway Postgres, fake storage, local Chrome):
- A full PL flow in the browser at 390×844.
- A MX flow through the API.
- The generated PDFs, with both signatures and dates, the owner and staff variants, and the licence number.
- Login with the new password.
- Approve → edit → re-approve in the editor.

**Ops after merge to dev** (manual):
1. `seedPartnerDocumentContent.ts`.
2. `setupPartnerSignatories.ts`, once each for PL and MX, using the PNGs from `secrets/signatures/`.
3. Łukasz approves the PL versions and Alfred the MX versions in the Documents tab.
4. Re-send one test invite.
