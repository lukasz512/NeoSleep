## Refined User Story: Admin/Manager Document Content Editor

**Classification**: feature
**Raw input**: Admin and manager roles get a new "Documents" editing view, added as a new tab in the left sidebar navigation. A simple WYSIWYG editor for document CONTENT only — not layout, not the shared header/logo/footer (those stay fixed/common across every document). Targets the document templates built in this session (`packages/documents`: patient informed consent, doctor GDPR-consent PL/MX variants, and the still-to-be-drafted PL/MX collaboration agreement) — currently their body prose lives as static content (i18n JSON keys or literal HTML in template files), only changeable via a code commit + deploy today. Dynamic substitution markers within the content (per-instance data-fields, brand/entity params) must render visually distinct (bold, different color) in the editing surface so an editor can see them and not break them by accident. Future/deferred TODO: autocomplete of available substitution tokens from an API. Explicit process requirements: plan it well, build once properly, refactor pass afterward, 100% test coverage, intuitive UX, reuse existing patterns rather than introducing new ones where avoidable.

### As an admin or manager, I want to edit the wording of legal/consent document content directly in the app, so that a wording fix or a new jurisdiction's text doesn't require engineering time and a deploy cycle.

### Stakeholder Notes
- 👤 User: Today, changing a single sentence in a consent document requires asking engineering to edit an i18n JSON key or an HTML template file and ship a deploy. This view removes that dependency for content changes (not layout/branding).
- 🏢 Client: Tenant admins get self-service control over legally-sensitive document wording without depending on NeoSleep engineering turnaround — meaningful given these documents are jurisdiction-specific (GDPR vs. LFPDPPP) and a wording correction may be urgent.
- 🩺 Patient: Indirect but real if the patient informed-consent template is in scope here — a careless edit could alter clinical/consent language a patient relies on to understand risks. Needs the same "a signed document is a point-in-time artifact, edits never retroactively change an already-generated PDF" protection already established elsewhere in this story, plus an audit trail of who changed what content and when.
- 🚀 NeoCRM/Platform: High relevance — this is reusable white-label infrastructure. Any tenant could eventually want to customize their own legal wording without NeoSleep engineering involvement, once a DB-driven template store exists instead of static files.
- ⚖️ Compliance: Real flag. Editing legal/consent content needs an audit trail and very likely versioning (so a specific historical wording can be tied to documents already signed under it, not just "whatever the current content happens to be"). Needs `/legal` input on retention/audit requirements and `/arch` input on the versioning data model.

### Medical-Industry Trend Check
n/a — internal admin tooling, not a clinical/PCF/HCP-engagement design question.

### Acceptance Criteria
- [ ] A "Documents" nav entry appears only for the roles confirmed in Open Questions below (config-driven nav item per CLAUDE.md rule 2, RBAC-gated on the backend, not just hidden in the UI).
- [ ] Admin/manager can edit the body content of each in-scope document template without a deploy.
- [ ] Header/logo/footer remain fixed/shared — not editable through this view, consistent with the render pipeline's brand tokens.
- [ ] Dynamic substitution markers (data-field per-instance fields, {legalEntityName}/{company}-style params) render visually distinct (bold, distinct color) in the editing surface and can't be silently deleted/corrupted by normal text editing.
- [ ] Editing content does not retroactively change already-generated/signed PDFs.
- [ ] Every content change is attributed (who, when) — audit trail.
- [ ] 100% test coverage for the new backend command/query/route and the frontend editor logic.
- [ ] A dedicated refactor pass happens after the first working version lands — not skipped, not bundled silently into the first PR.

### Open Questions
- [ ] **Role name**: Łukasz said "admin i manager" — CLAUDE.md's role list is `admin`, `ffm`, `kam`, `msl`, `rep` (no literal "manager"). Does "manager" mean `ffm` (Field Force Manager) specifically, or something not yet modeled? This blocks correct RBAC gating.
- [ ] **Versioning**: does saving an edit create a new version (traceable — a prior signed PDF's content can be tied to the version active when it was signed), or is it a single mutable row per template+locale (simpler, but loses that traceability)? Given compliance sensitivity, versioning looks like the safer default, but this is an `/arch` decision, not one to assume.
- [ ] **Granularity of "content"**: per-paragraph i18n-style keys (matches today's architecture, e.g. edit `documents.gdprConsentPl.p1` individually) or one continuous whole-document rich-text edit surface per template+locale? A "simple WYSIWYG" reads more like the latter; per-paragraph keeps the current brand/i18n substitution mechanism unchanged. Needs Łukasz's steer.
- [ ] **Scope**: does this cover all three template families (patient informed consent + doctor GDPR consent + collaboration agreement) from day one, or start narrower? Patient consent language is the most clinically sensitive of the three.
- [ ] **Storage migration**: does DB-driven storage retire the static i18n JSON/HTML template content entirely, or do the static files become a one-time seed (first deploy loads DB rows from current content, DB becomes source of truth after)? Affects whether the existing i18n CI-parity gate (en/pl/mx key-set check) still applies, and how, once content can live in a DB the CI runner doesn't have access to.
- [ ] **WYSIWYG technology**: no rich-text-editor dependency currently exists in the repo (to confirm during `/arch`/Plan research) — needs picking (or a minimal contenteditable-based component), per Łukasz's "reuse what we have" preference this should be checked before adding a new library.

### Hand-off
→ `/arch assess` — data model (versioning), storage-migration strategy from static files to DB, WYSIWYG technology choice
→ `/legal` — audit/retention requirements for edited legal/consent content
→ `/dev` — implementation once the above are settled
