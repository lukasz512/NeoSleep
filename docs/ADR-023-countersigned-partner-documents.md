# ADR-023: Countersigned partner documents — approval-gated signatory, one render path

## Status
Accepted (NEO-51, 2026-09-24)

## Context

Invited doctors used to finish `/partner-register` by ticking two checkboxes
over plain i18n text and drawing one signature, which the API stamped into
two pdf-lib PDFs with no NeoSleep signature. Łukasz wanted the real
documents from the Documents tab, already signed by NeoSleep, signed by the
doctor, and emailed to both parties. The /legal review
(`docs/stories/partner-onboarding-countersigned-documents.md`) added
constraints:

- A drawn simple e-signature is enough (PL documentary form, MX Código de
  Comercio) — but the NeoSleep signatory's signature must only ever appear on
  text **that signatory approved**, never on whatever an admin last saved in
  the Documents editor.
- The doctor's own data is covered by an information notice (acknowledged,
  not signed); patient data needs a DPA, which is Annex 1 of the agreement.
- The evidence trail must pin the exact text version and the signed file.

## Decision

1. **Signatory config per tenant** in `app_config.metadata.partnerSignatories`
   (no schema change): per jurisdiction (PL/MX) a printed name, a
   private-bucket path to the signature PNG, the approver user id and the CC
   inbox; plus `approvedVersions` (`"<templateKey>.<locale>" → versionId`).
   Only the jurisdiction's approver can approve (`POST
   /document-content/:t/:l/versions/:id/approve`); saving a new version
   leaves it unapproved. `resolvePartnerDocumentSet` refuses unapproved
   versions everywhere — activation (no invite goes out that can't be
   completed), preview and accept.
2. **Locale = jurisdiction** for partner documents: one template per
   document (`partnerAgreement`, `partnerDpa`, `partnerPrivacyNotice`) with
   `pl`/`mx` content versions, instead of `*.pl`/`*.mx` template files. The
   legally different parts (parties, law, authority) come from locale-bound
   i18n chrome and content.
3. **One render path.** The PDF (Puppeteer, `documentRenderer.ts`) and the
   PWA preview (sandboxed iframe) both fill the same template HTML with the
   same `applyDocumentFields` (`@neo/documents` browser entry): `data-field`
   text, PNG-only `data-image` slots, `data-variant` (owner/staff party
   clause). The DPA is spliced into the agreement's `{{slot:annex}}` so one
   signature covers both. pdf-lib is removed.
4. **Version pinning.** Accept carries the version ids the doctor read; a
   mismatch with the current approved set is a 409
   (`DOCUMENT_VERSION_STALE`). Consent (`legal_basis='contract'`) and
   `file_attachment` metadata store version ids, SHA-256 of the PDF, both
   dates, jurisdiction, role and invite-token id; the notice gets an
   acknowledgement audit row, never a consent row.
5. **Dates.** NeoSleep's countersignature date is the activation that minted
   the invite token (`invite_tokens.metadata.counterparty_signed_at`); the
   doctor's is server time at Finish.

## Consequences

- A white-label tenant configures its own signatories and texts with no
  code change (`scripts/setupPartnerSignatories.ts`, Documents tab).
- Editing the agreement blocks new partner invites for that country until
  the signatory re-approves — intended, and shown as a banner in the editor.
- The signature PNG is served only inside the token-gated preview response
  and generated PDFs; a leaked invite token can still retrieve it within the
  rate limit, which was judged acceptable (the doctor receives it in the PDF
  anyway).
- Puppeteer is now on the invite-accept path: the renderer relaunches Chrome
  after a disconnect instead of failing every render until an API restart.
- Found and fixed alongside: invited doctors' logins were bootstrapped with
  the shared initial password on every API start; now excluded, and password
  login rejects non-active accounts.
