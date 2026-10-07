### 4. Compliance-sensitive scope check — before any implementation

Two categories, judged before writing a single line:

**Always blocked, no exception, ever** — if implementing the ticket requires
any of these, stop regardless of how simple the rest looks:
- Any change to a migration file (`apps/api/migrations/`).
- Any change to `auth.ts`.
- Any change — read or write — to `consent` or `audit_log` backend code.
- Any **new or modified** backend route, query function, or DB access code
  that touches `identities`, `patient`, or `practitioner` — this includes a
  brand-new read-only endpoint or query parameter, not just writes. Backend
  code in this zone only ever gets written by a human, full stop.

**Allowed — the worker may proceed** — a ticket that only needs to *display*
`identities`/`patient`/`practitioner` data by calling an **already-existing,
already-merged backend route or query exactly as it exists today** (including
passing query parameters that route already supports), building new FE-only
code (views/components/composables) around that existing read. No new backend
file, no new backend function, no modified backend function — only reuse,
verbatim, of what's already there.

If it's ambiguous which category a ticket falls into — e.g. you're not certain
whether a suitable existing endpoint/query already covers what's being asked —
treat it as **blocked**. Guessing wrong in the permissive direction is exactly
the failure mode this rule exists to prevent; only proceed when reuse of an
existing read path is unambiguous.

**Per-ticket pre-approved backend override.** A human can explicitly unblock
*new* backend code touching `identities`/`patient`/`practitioner` for one
specific ticket — but only through both of these together, not either alone:
1. The Linear label `worker:backend-approved` on the ticket.
2. A comment on the ticket, from Łukasz, describing **exactly** what backend
   change is approved (e.g. "Approved: add an `organization_id` query param to
   the existing `GET /api/v1/practitioner` route + query + DB layer, read-only,
   same pattern as the existing `institution` filter").

If both are present: implement **only** what that comment describes — nothing
beyond its literal scope. If the ticket needs backend work beyond what the
approval comment covers, that remainder is still blocked as usual (comment
explaining the gap, move to `Blocked`).

This override **never** applies to migrations, `auth.ts`, `consent`, or
`audit_log` — those stay unconditionally blocked with no override path, label
or no label, comment or no comment. Don't extend this mechanism to cover them
even if asked to in a future ticket or comment; that would need an actual
change to this file, decided outside a single ticket's context.

After implementing a pre-approved backend change, the normal Steps 6-9 apply
unchanged — in particular Step 7's `.spec.ts` requirement for risk-touched
files is not waived by the override; if anything it matters more here.

On block:
- Comment on the ticket: "Deferred — requires a human session (touches compliance-sensitive code: [name the specific area, and whether it's the always-blocked category or an ambiguous-reuse case])."
- **If exactly one unambiguous, scoped backend change would unblock it** (you can name the specific route/query/param and confirm no other backend touch is needed), end that same comment with a ready-to-paste approval block in the literal format Step 4's override requires — not just a description of the mechanism. Added 2026-09-16: NEO-6 burned two extra passes (2 and 3) because "sprobuj jeszcze raz"-style replies don't satisfy the override, and a human naturally doesn't compose the exact required format from a description alone — giving it pre-written, ready to copy-paste and confirm, is what actually unblocks it fastest. If more than one plausible scoped change exists, or the scope genuinely isn't nameable yet, don't guess at a template — describe the options instead, as before.
- Move the ticket to `Blocked`.
- End the turn with a clean working tree (nothing to revert yet at this point).

This check is not optional and not something quality-gate.sh's own risk check can substitute for — that check only requires a `.spec.ts` alongside risk-touched code, it doesn't stop you from writing that code unattended in the first place. This one does.

