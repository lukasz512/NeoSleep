# Samples module (planned)

Future rep-app module for **sample warehouse** and **promotional materials**: reps give product samples or promo materials to HCPs, with signed acceptance and optional email confirmation.

## Goal

- **Sample warehouse**: simple inventory of product samples / promotional materials that reps can hand out.
- **Handout flow**: rep selects sample(s), links to HCP; HCP signs a form confirming receipt/acceptance of the sample.
- **Later**: HCP can receive email confirmation (e.g. copy of the signed form or delivery note).

## Scope (to be detailed in a SPEC)

- Rep-facing: browse sample catalog, record handout (what, to whom, when), trigger HCP signature form (e.g. in-app or link to sign).
- HCP-facing: form to sign that they accept the sample (audit trail; compliance).
- Optional: email to HCP with confirmation (e.g. after signature; depends on email engine – SPEC-0007).

## Data and API (future)

- Entities: sample catalog (product/material), sample handout (rep, HCP, items, date, signature status), HCP signature record.
- BFF: e.g. `GET /api/samples`, `POST /api/sample-handouts`, `GET/POST` for signature capture; email sent via BFF or Make.com when configured.

## References

- **Email**: SPEC-0007 (Email Engine); confirmation email can be triggered from BFF or automation.
- **Compliance**: AUTOMATION_AND_COMPLIANCE.md – treat signed acceptance as part of audit trail; data retention may apply.

## Status

**Planned.** No implementation yet. When ready, add a SPEC (e.g. SPEC-00XX Samples & HCP signature) and implement rep view, BFF endpoints, and signature flow; email confirmation can follow.
