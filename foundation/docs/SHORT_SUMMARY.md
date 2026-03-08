# Short summary (conversation → blueprint)

- Build a **white-label** multi-tenant platform for Neo Sleep Care.
- Core product now: **Rep PWA** for B2B sales (Leads/HCP/HCO, presentations, meeting mode, Post-Call Form).
- **Offline goal:** reps can run meetings for ~30 minutes without internet (PDFs cached + PCF queue).
- **Auth:** reps via Google Workspace OIDC (2FA enforced by Workspace). Future portal via **magic link** email.
- **Data model:** HCP ↔ HCO many-to-many; HCP has default HCO; reps see region/owner scoped data.
- **Content:** V1 Canva → PDF, show offline, track slide engagement.
- **AI hub:** via OpenRouter, with **prompt versioning per tenant**; copilot Q&A + PCF auto-draft from dictation.
- **i18n:** EN source-of-truth; languages: EN, ES-MX, DE, TR, FR, NO, PL. CI extracts keys, marks unused, prunes after safety window, auto-translates via PR. Tolgee self-host later for UI editing.
- **Emails:** transactional provider + MJML templates + localization + tenant branding.
- Engineering: SPEC-first + ADRs + tests + docs on every PR; Cursor/Copilot generate PRs, you supervise.
