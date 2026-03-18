# Conversation summary (seed)

Date: 2026-02-18

## Product vision
- White-label SaaS for Neo Sleep Care with configurable tenant JSON (branding, forms, features).
- Core Rep PWA: leads/HCP/HCO, PDF presentations, meeting mode, post-call forms, offline for ~30 minutes.
- Future separate portal (HCP/patient) with magic link auth and sensitive medical data.
- Google Workspace OIDC for reps; 2FA enforced via Workspace policy.

## Content & tracking
- V1 presentations: Canva -> PDF; show offline.
- Track slide engagement (page/time + gesture heuristics).

## Data model
- HCP person can belong to many HCOs; HCO has many HCPs; HCP has default HCO.
- Rep sees own/region-scoped records.

## i18n
- EN as source-of-truth.
- Languages: EN, ES-MX, DE, TR, FR, NO, PL.
- Want Localise-like UI but avoid paid: self-host Tolgee.
- CI should extract keys, auto-add new, mark/prune unused keys, auto-translate new keys via Make/OpenRouter PRs.

## Emails
- Need dynamic transactional templates (magic links, portal links).
- Provider + DNS: SPF/DKIM/DMARC.
- MJML + Handlebars, localized and tenant-branded.

## AI hub
- Prompt versioning per tenant with audit.
- Rep copilot + PCF draft from dictation transcript.
- Monthly insights from reps' questions.

## Engineering workflow
- SPEC-first, ADRs for decisions, PR checklist.
- Cursor/Copilot generate PRs with tests + docs; human supervises.
