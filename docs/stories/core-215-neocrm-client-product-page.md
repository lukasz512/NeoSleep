## Refined User Story: neoCRM client-facing product page

**Classification**: feature (new public page with sales claims that legal, marketing and the CEO lens could each push back on)
**Raw input**: "I need a page about neo CRM, for the client. The clients will differ, so I want to sell a secure CRM with WCAG accessibility and so on. Let's plan what can go there. It should be part of this project: https://alfredjan.com/corporativo/"
**Ticket**: CORE-215

### As a decision maker at a prospective client, I want to see what neoCRM does, how it protects our data and whether our whole team can use it, so that I can decide to book a demo without a sales call first

### Stakeholder Notes
- 👤 User: the reader is a buyer (operations head, IT/security officer, compliance officer), not an app user. They scan for proof, not adjectives. Today there is nothing to send them; the only public site (`apps/web`) sells sleep care to patients and doctors.
- 🏢 Client: buyers in regulated sectors must justify the choice internally. A page with verifiable security and accessibility facts shortens their vendor assessment. Public-sector and large corporate buyers in the EU increasingly ask for an accessibility statement.
- 🩺 Patient: no downstream patient effect. Indirect only: an overstated security claim would mislead a client that stores patient data with us.
- 🚀 NeoCRM/Platform: this is the first asset that sells the platform itself rather than one tenant. It must be industry-neutral enough for "different clients" and reuse `@neo/brand` and `packages/i18n`.
- ⚖️ Compliance: flagged for `/perspective legal`. Every security, privacy and accessibility statement is an advertising claim. Several obvious ones would be false today (see the ledger).

### Medical-Industry Trend Check
- n/a at this stage. The page is a sales asset, not a clinical or rep workflow. A competitor comparison (`/marketing:competitive-brief`) is the right tool once the audience is decided.

### Reference project
`https://alfredjan.com/corporativo/` currently renders only the text "AJ Management"; the root domain is a "coming soon" placeholder for "ALFRED JAN / EVENTS". There is no structure, copy or visual style to follow yet, so how the page attaches to that project is an open question.

### Proposed page sections
1. **Hero**: one-sentence promise (a CRM for field and clinical teams that is secure by design and usable by everyone), primary CTA, one product screenshot.
2. **Who it is for**: 3 short use-case cards (the set depends on the audience decision).
3. **Product tour**: contacts and organizations, patient or customer records, calendar and appointments with reminders, forms with self-fill and e-signature, PDF documents, notifications (in-app, push, email), dashboards and reports, mobile-first PWA with offline reading.
4. **Your brand, your language**: white-label theming and logo, EN / PL / ES out of the box, per-client wording overrides, roles and territories that mirror the client's structure.
5. **Security**: only verified facts, each with a one-line plain-language explanation (ledger below).
6. **Accessibility**: what is built in, how it is checked, link to an accessibility statement.
7. **Privacy and compliance**: consent records, access logging of sensitive data, where data is hosted (stated honestly), what is on the roadmap.
8. **How onboarding works**: 3 to 4 steps from demo to go-live.
9. **FAQ**: hosting location, data ownership and export, integrations, pricing model, support.
10. **Closing CTA**: demo request form.

### Claims ledger (evidence from the repo, 2026-11-16)

**Can say today**
- Each client's data lives in its own isolated database schema (`apps/api/src/db/tenant.ts`, migrations).
- Role-based access with six roles, scoped to territory (`apps/api/src/db/users.ts`, `context/TenantContext.ts`).
- Audit trail, including who viewed sensitive health data (`apps/api/src/db/audit-log.ts`, `commands/healthDataReadAudit.ts`).
- Passwords are hashed (bcrypt); sessions use short-lived access tokens with rotating refresh tokens (ADR-020).
- Rate limiting on login and public endpoints; security headers; origin allow-list (`middleware/rateLimiter.ts`, `server.ts`).
- Nightly backups, encrypted before upload, each one restore-checked (`.github/workflows/nightly-backup.yml`).
- Every code change is scanned (CodeQL, secret scanning) and dependencies are updated weekly (`.github/workflows/security.yml`, `renovate.json`).
- Secrets are kept in a managed secret store, never in the apps (`docs/INFRASTRUCTURE.md`).
- Consent records for patients (`apps/api/src/db/consent.ts`).
- Accessibility building blocks: AA contrast in brand colors, 44 px touch targets, reduced-motion support, announced form errors, keyboard-operable dialogs (stories under `docs/stories/`, `packages/brand/colors.ts`).

**Can say only with a caveat**
- "Designed to WCAG 2.2 AA": self-assessed, no external audit, no automated accessibility tests in CI yet.
- "Sign in with Google": code exists; production configuration not verified from the repo.
- "Works offline": read cache only.
- "Built with GDPR and LFPDPPP in mind": privacy texts and consent exist; there is no data export or erasure workflow yet.

**Must not say today**
- Any certification (ISO 27001, SOC 2, HONcode) or "WCAG certified / compliant".
- "Hosted in the EU": API runs in us-west2, database in us-west-1.
- "Two-factor authentication": not in the app.
- "Tamper-proof audit log": ADR-010 is only proposed.
- "Row-level security", "24/7 monitoring", "data export and erasure on request".

**Gaps that would turn a caveat into a claim** (candidates for separate tickets): automated axe checks in CI plus a published accessibility statement; in-app MFA; EU hosting option; data export and erasure workflow; append-only audit log; error monitoring.

### Acceptance Criteria (testable)
- [ ] Every security, privacy and accessibility sentence on the page maps to a ledger row with a repo path; a test fails if the copy contains a phrase from the "must not say" list.
- [ ] All copy lives in `packages/i18n` with key parity across the chosen languages.
- [ ] The page itself passes an automated axe run with zero violations and is fully keyboard-operable (it sells accessibility, so it has to demonstrate it).
- [ ] No tenant or partner names and no sleep-care-specific wording in the industry-neutral sections.
- [ ] The demo form submits through the API (`routes/website-contact.ts` pattern), with rate limiting and no secrets in the frontend.
- [ ] Renders correctly at phone width and in light and dark themes.

### Decisions (Łukasz, 2026-11-16, decision form `neocrm-page-r1`)
- **D1 Where it lives**: built in this repo, published under `alfredjan.com/corporativo/neocrm`.
- **D3 Claim level**: facts implemented today plus a "What we are working on" section without dates. The forbidden-claims test allows roadmap items (EU hosting, 2FA, WCAG audit, ISO 27001) only inside that section.
- **D4 WCAG**: automated accessibility tests on every release and an accessibility statement come first (separate ticket); the "WCAG 2.2 AA" sentence is published only after that. Until then the accessibility section lists concrete facts only (AA contrast, 44 px targets, keyboard, reduced motion).
- **D5 Call to action**: demo request form plus a downloadable one-page security PDF.

- **D2 Audience** (chat, 2026-11-16): mainly companies from Spain, small for now. Consequences: copy in European Spanish (the platform's `mx` locale is Mexican Spanish, so the page needs its own es-ES texts), plain-language security section, onboarding and pricing higher on the page. US hosting becomes the first objection of an EU buyer.
- **Roadmap section** (chat, 2026-11-16): list WCAG and ISO 27001 as in progress. WCAG is covered by CORE-217. `docs/CERTIFICATIONS.md` records ISO 27001 as not started, so "in progress" is only truthful once a first step exists; wording pending Łukasz's confirmation.

### The `para` link (reference: alfredjan.com/corporativo)
On the reference site `?para=<name>` (alias `for`) greets the prospect by name in the entry animation, the hero and the contact section; known clients also get their logo; any other value is sanitised and cut to 32 characters. Nothing else on the page changes. Łukasz wants this part more developed for neoCRM and asked for proposals before development. Six were presented (greeting, sector preset, client-branded preview, role lens, tailored offer, private expiring link); recommended order: 1 + 2 + 4 first, 3 next, 5 and 6 later.

### Open Questions
- [x] Which `para` proposals to build: 1 (greeting), 2 (sector) and 4 (role lens, the priority) in version 1; 3 right after; 5 and 6 later (Łukasz, 2026-11-16).
- [x] ISO 27001 wording: "in progress", with the first step recorded in `docs/CERTIFICATIONS.md` (internal gap analysis started 2026-11-16). The page says there is no certification or external audit yet (Łukasz, 2026-11-16, artifact decision D1).
- [x] Where demo requests go: the demo form through the API plus the security PDF, built in CORE-218; until then version 1 opens a pre-filled email or WhatsApp message to the site's existing contact (Łukasz, 2026-11-16, artifact decision D2).

### Version 1 as built (2026-11-16)
- Placement: a second page of the AJ Management site, `clients/ajm/corporativo/neocrm/index.html` + `src/neocrm/`, published at alfredjan.com/corporativo/neocrm/ by the existing deploy. It keeps its own copy and colours and imports nothing from neoCRM (CORE-47).
- Languages: European Spanish (default) and English (`?lang=en`). Polish is not on the page.
- Link parameters: `?para=<name>`, `?sector=clinicas|distribucion|equipos`, `?rol=direccion|it|operaciones` (English aliases accepted). The role reorders sections in the DOM, never hides one; personal links carry `noindex`.
- Tests: `lens.spec.ts` (parsing, order, link), `claims.spec.ts` (no forbidden claim outside the roadmap, hosting country stated, ES/EN key parity), `NeoCrmApp.spec.ts` (order on the page, switch, greeting, sector).

### Hand-off
→ `/perspective legal` on the claims ledger once the claim level is decided
→ `/perspective marketing` + `/ux` for copy and layout
→ `/arch assess` only if the page is hosted outside `apps/web`
