# ADR-016: Transactional email moves from Gmail SMTP to Resend

## Status
Accepted

## Context
`apps/api/src/mailer.ts` sent every transactional email (password reset, partner
invites, contact form notifications) through Gmail SMTP via `nodemailer`, using a
personal `@gmail.com` account and app password.

This broke in production: Render blocks outbound traffic on SMTP ports 25, 465,
and 587 for Free-plan web services (confirmed via Render's own changelog, effective
2025-09-26 — `neosleep-bff` runs on `plan: free` in `render.yaml`). Every send
attempt failed with `ETIMEDOUT` at the TCP-connect stage — before authentication
was even attempted. It worked when the API ran locally (unrestricted outbound
network) and silently failed on every deployed environment, since Render hosts
both `pwa.neosleepcare.com` (prod) and `pwa-dev.neosleepcare.com` (dev) behind the
same single BFF instance.

Separately, `GMAIL_USER` sending as an address on `neosleepcare.com` would have
failed domain authentication anyway: that domain's mail is on Microsoft 365 (see
`docs/INFRASTRUCTURE.md` MX records), not Google Workspace, so it can't do Gmail
SMTP AUTH, and the domain's SPF record (`v=spf1 include:secureserver.net -all`,
hard fail) doesn't authorize Gmail's servers to send as `@neosleepcare.com` at all.
Gmail SMTP was fragile even ignoring the Render port block: a personal account,
~500 messages/day cap, no delivery/bounce visibility, and Google periodically
flagging sign-in attempts from unfamiliar (cloud) IPs as suspicious.

Two ways out were considered:
- Upgrade `neosleep-bff` to a paid Render instance — removes the port block, zero
  code change, but keeps every other Gmail SMTP fragility above and adds a
  recurring cost paid for infrastructure, not the actual problem.
- Move off SMTP entirely to an HTTP-API email provider — sending goes over HTTPS
  (443), which is never port-blocked anywhere, and the provider handles
  deliverability, DKIM/DMARC alignment, and bounce/complaint tracking properly.

## Decision
Move transactional email to **Resend**, sent over its HTTP API (`resend` npm
package) instead of SMTP. Chosen over Postmark for its free tier (3,000
emails/month, sufficient for current volume — see Consequences) at effectively
zero cost for this stage of the project; revisit if volume outgrows it.

**Sending domain: a dedicated subdomain, not the apex.** Resend's own domain
verification adds an MX record (for bounce/complaint feedback) alongside SPF and
DKIM TXT records. The apex `neosleepcare.com` already has an MX record for
Microsoft 365 (human mailboxes) and an SPF record scoped to GoDaddy — adding
Resend's own MX/SPF there would conflict. A fresh subdomain (recommended:
`send.neosleepcare.com`) starts with no existing DNS records, gets Resend's own
independent SPF/DKIM, and keeps transactional sending fully isolated from the
domain's human mail (Microsoft 365) — a problem in either direction (mass
transactional mail hurting the reputation of human mail, or vice versa) becomes
structurally impossible instead of something to manage. Sender address becomes
e.g. `noreply@send.neosleepcare.com` — still clearly branded, no real mailbox
required (an ESP-verified sending address doesn't need an inbox behind it; a
`noreply@` address doesn't receive replies by design).

Migrating human mailboxes (GoDaddy/Microsoft 365 → home.pl, raised in the same
conversation as a cost concern) is explicitly **out of scope** for this ADR — a
separate, unrelated decision about where people's real inboxes live.

**Attachments.** The current inline-image attachments (logo, social icons in the
email footer, referenced via `cid:` in the HTML) needed a shape change: Resend's
Node SDK attachments take `content: Buffer` + `contentId` (not nodemailer's `path`
+ `cid`). `@neo/email`'s `getEmailAttachments()` now reads the asset files into
`Buffer`s directly and returns a local, provider-agnostic `EmailAttachment` type —
removing `@neo/email`'s `nodemailer` dependency, which existed only for that one
type import.

**Testing.** CLAUDE.md's "no mock-only tests" rule is scoped to PostgreSQL
integration tests, not third-party paid APIs — mocking Resend's HTTP client in
`mailer.spec.ts` is the correct approach (see `googleCalendar.spec.ts` for the
established pattern: `vi.mock` the SDK, `vi.doMock("./env.js")` +
`vi.resetModules()` per test to cover both the "configured" and "not configured"
code paths). These run in the normal blocking `pnpm --filter @neo/api test` CI
step — no real network call, no real API key needed, so a broken `mailer.ts`
fails the build instead of failing silently in production again.

## Consequences
- Enables: transactional email works from any Render plan (HTTPS is never
  port-blocked); proper SPF/DKIM/DMARC alignment for the sending subdomain;
  delivery/bounce visibility in Resend's dashboard; no personal Gmail account
  dependency; automated test coverage that would have caught this class of
  failure before it reached production.
- Closes: nothing — `sendContactEmail`, `sendPasswordResetEmail`,
  `sendPartnerInviteEmail` keep their existing signatures, so every call site
  (`auth.ts`, `commands/invitePractitioner.ts`, `routes/website-contact.ts`) is
  unchanged.
- Cost: $0 at current volume (Free tier: 3,000 emails/month, 100/day, one
  domain). Revisit (Pro, $20/mo for 50,000 emails) only if volume grows past
  that — not a concern at this stage.
- New external dependency: Resend account, with its own DPA for GDPR purposes
  (see Compliance Impact) — added to `secrets/accounts.md`.
- Requires one manual, one-time step outside this repo: adding the `send`
  subdomain in Resend's dashboard and pasting the DNS records it generates into
  Cloudflare (`docs/INFRASTRUCTURE.md`'s DNS table gets a new row once that's
  done).

## Compliance Impact
Transactional emails carry personal data (name, email address) of leads, HCPs,
and staff. Resend acts as a GDPR data processor for that data in transit —
requires accepting Resend's DPA (available in their dashboard/Trust Center)
before sending real personal data through it. No special-category (Art. 9) data
is included in any of the three email types this ADR covers.
