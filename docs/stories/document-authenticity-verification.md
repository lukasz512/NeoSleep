# Document authenticity verification (QR + ID in the footer)

Status: `deferred`: requested by Łukasz on 2026-09-26, not scheduled. The Linear
connector was not authorised in that session, so this file stands in for the ticket.
Create the Linear ticket from it when the work is picked up.

## Why

Every generated PDF (partner agreement, privacy notice, patient consents,
clinical forms) now uses the "clinical modern" footer (see
`packages/documents/assets/docTheme.css` and `renderDocumentFooterHtml`). The
chosen design (option C) also has an ID and a QR code that let anyone who holds
the paper or the PDF check that NeoSleep really issued it and that it has not
been changed. The footer has room for this, but it is not built yet.

This is standard practice for medical and legal documents: e-prescriptions,
hospital discharge summaries (NHS, Mayo), EU COVID certificates and bank
statements all carry a short code or QR that leads to an issuer-hosted check page.

## How it would work

1. **Issue.** When apps/api renders a PDF, it first creates a verification record:
   - a public ID: random, about 10 characters of Crockford base32 (for example `7F3K-92QD-XA`),
     at least 50 bits of entropy so IDs cannot be guessed or enumerated;
   - the template key, the reference code and content version (`NSL-PA-PL v1.1`), and the issue time;
   - the issuing tenant, and a status (`valid`, `revoked`, `superseded`).

   The ID and a QR code (pointing to `https://neosleepcare.com/verify/<ID>`) go
   into the footer. After rendering, the API stores the **SHA-256 of the final PDF bytes**
   on the record.
2. **Check.** Scanning the QR code or typing the ID opens a public page that shows:
   - the status, the document type, the issue date and the issuer (NeoSleep, legal entity);
   - no health data and no full names. At most the parties' initials, because
     patient documents are special-category data under GDPR/LFPDPPP;
   - an optional "Compare file" step: the visitor drops the PDF, the page hashes it
     **in the browser** (the file is never uploaded) and reports "identical to the issued
     document" or "does not match".
3. **Revoke.** An admin can mark a document revoked or superseded (for example, when an
   agreement is re-signed). The check page then shows that.

## Constraints and risks

- The check endpoint is public: it needs rate limiting, IDs that cannot be enumerated,
  an `audit_log` entry for every lookup, and generic "not found" answers.
- Only the API can issue IDs or change a status (it is the trust boundary). The page is read-only.
- Paper copies can only be checked for status, not by hash. That is enough to
  expose a forged document ID. It cannot detect an altered paper copy that carries a real ID.
- Stronger option for later: a PAdES digital signature (qualified e-seal) on the
  PDF itself, which any PDF reader validates. The QR check complements it and
  does not replace it.

## Open questions (for Łukasz)

- Where the page lives: `apps/web` (neosleepcare.com/verify) or an API-served page.
- Which documents get it: all of them, or only signed documents (agreements, consents).
- What the page shows about the parties: nothing, initials, or the full clinic name.
- The storage schema: a `platform` table (a single verify URL for all tenants) or
  a table per tenant schema. Per-tenant white-label domains favour per tenant.

## Touch points

- `packages/documents/src/documentRender.ts`: `renderDocumentFooterHtml` gets an optional `verification: { id, qrSvg }`.
- `apps/api`: a new migration for the verification table, issuing in `partnerDocuments.ts`,
  `patientChecklist.ts` and `questionnaireRequest.ts`, and a public `GET /verify/:id`.
- `apps/web`: the verification page and i18n keys (en/pl/mx).
