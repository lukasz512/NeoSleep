# Leads, HCP/HCO, and partner flow

**Flow:** Leads (tbl_leads) → when a lead agrees to become a partner → we create or link **HCP** (healthcare professional) or **HCO** (healthcare organization). We sign an agreement with them; the signed document is visible to that HCP in their portal. Rep app is the core for managing leads and the contact network; portal holds views for the HCP (including agreements/documents).

## Tables (from leads)

- **tbl_leads:** id, name, email, status, region, created_at. Source of potential partners.
- **tbl_hco:** Healthcare organization (clinic, hospital, practice). Columns: id, name, type, address (line1, line2, city, state, postal_code, country), region, phone, email, website, status, **lead_id** (source lead when converted), notes, created_at, updated_at.
- **tbl_hcp:** Healthcare professional (doctor, nurse). Columns: id, **hco_id** (FK – organisation they belong to), **lead_id** (source lead when converted), name, email, phone, specialty, role, status, region, notes, created_at, updated_at.

**Relations:** One lead can become one HCP or one HCO (we set lead_id on the new row). HCP can be linked to one HCO (many HCPs per HCO). So we build a network: leads → HCP/HCO; HCP ↔ HCO.

## Lead → partner flow (planned)

1. **Lead in rep app:** Rep works the lead (contacted, qualified, etc.). When the lead agrees to be our partner, we convert: create a row in **tbl_hcp** or **tbl_hco** and set **lead_id** to the original lead.
2. **Agreement signing:** We sign some form of agreement with the partner. Method TBD (e.g. document to sign on tablet during visit, or e-sign link). Once signed, the document must be stored and **visible to that HCP in their portal** (e.g. a “Contracts / Documents” or “Agreements” tab).
3. **Portal:** HCP logs into the portal and sees their documents/agreements there. Implementation later; add to backlog.

## Compliance: e-signature and documents (Mexico / MX)

- **Mexico** recognizes **electronic signatures** for contracts (Federal Commerce Code, Advanced Electronic Signature Law). Two types: **simple** (e.g. data identifying signer and approval – e.g. tablet signature) and **advanced** (e-firma/FIEL, certified). Simple e-signature has the same legal effects as handwritten and is admissible as evidence.
- **Requirements for enforceability:** The signed data message must be attributable to the signer, conserved in full, and kept available; the original must be kept. Using a tablet to capture signature and storing the signed document in our system (and showing it in the portal to the HCP) fits this if we ensure: (1) we can attribute the signature to the HCP (e.g. session or identity at sign time), (2) we store the document and signature in full and do not alter it. Exact implementation (which provider or in-house) TBD; document the decision when chosen.
- **Compliance note:** Check with local counsel for Mexico (MX) for any sector-specific rules (e.g. healthcare). The above is a short technical summary; not legal advice.

## Backlog / plans

- **Portal tab “Contracts / Documents” (or “Agreements”):** List of agreements/documents for the logged-in HCP; signed document visible (e.g. PDF). Only that HCP sees their own.
- **Rep app:** UI to “convert lead to HCP/HCO” and (when ready) to trigger or record agreement signing (tablet flow or e-sign link).
- **BFF:** Endpoints for HCP/HCO CRUD, and for uploading/retrieving signed documents (with access control by HCP id).

## Relation to other docs

- **AUTOMATION_AND_COMPLIANCE.md:** Leads → HCP/HCO data flow, inactive/anonymization.
- **DATA_AND_API.md:** BFF-only API; HCP/HCO and documents will be served via BFF.
- **THEMING_AND_PORTAL_APPEARANCE.md:** Portal appearance (including color) is set by admin; portal holds views for the HCP.
