# Partner agreement: sign on your phone (CORE-166)

## Story
As a doctor completing partner registration on a computer, I want to sign the
agreement on my phone by scanning a QR, so my signature is drawn with a finger
rather than a mouse.

## Angles checked
- **User (doctor):** the mouse pad stays; "Sign on your phone" is an option under it (hidden on phones, where the pad is already finger-sized). The phone page only collects the signature; the doctor read the agreement on the computer, and the signed preview there shows exactly what will be saved.
- **Tenant/platform:** generic (CORE): no tenant data, no new table. The handoff lives on `invite_tokens.metadata.sign_handoff` and dies with the invite.
- **Compliance/security:** the QR carries a separate 15-minute, sign-only token in the URL fragment (`/partner-sign#<token>`), not the invite token. It cannot read the documents or accept the invite. Pickup needs both tokens, works once, and then clears the signature from the row. The phone signing is audit-logged (`sign_on_phone`, phone IP and user agent). An unpicked phone signature is dropped when the invite is accepted.
- **Patient:** not affected (patient consent already has its own QR flow).

## Acceptance (each is a test)
- QR start returns a token ≠ invite token; it cannot preview documents or validate the invite (`invitePractitioner.spec.ts`).
- Phone sign works once; pickup returns the signature once, then the code is expired.
- Expires after 15 min; a new QR replaces the old one.
- Non-PNG or oversized (>400 kB) signature is rejected.
- Desktop dialog: QR shown and polled every 4 s; the phone signature is emitted as `signed` (`PartnerDocumentDialog.spec.ts`).
- Phone page: token from the fragment; sent, expired and no-token states (`PartnerSignView.spec.ts`).

## Defaults chosen (no question needed)
- TTL 15 min, poll every 4 s while the tab is visible, rate limit 300 per 15 min per IP.
- `/invite/accept` and the phone sign route accept bodies up to 600 kB (phone signatures are larger than mouse ones).
