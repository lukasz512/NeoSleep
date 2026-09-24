## Refined User Story: Entity history tab — humanized icon timeline

**Classification**: feature
**Raw input**: Linear NEO-26, "pwa: entity view history tab". Łukasz (in Polish, with an attached mockup image): "tak chcialbym zeby to wygladalo, taki poziom humanizacji historii. i kolorowe ikonki. i linia. piekne to jest." — "yes, I'd like it to look like this, that level of humanization of history. and colorful icons. and a line. it's beautiful."

### As a rep, KAM, or FFM viewing an HCP/HCO/Patient detail page, I want the History tab to read as a clear visual timeline (colored icon per action, connecting line) instead of a bare text list, so that I can scan what happened to a record at a glance instead of parsing rows of plain text

### Stakeholder Notes
- 👤 User: Every internal role that opens a detail page's History tab (rep/KAM/FFM/MSL) hits the same flat list today — a wall of dates and verbs with no visual hierarchy. A timeline with a colored icon per action (create/update/delete/restore/read) lets them scan for "what changed and when" at a glance instead of reading every line.
- 🏢 Client: No new data or reporting capability for the tenant admin — this is a legibility improvement to a screen that already exists and is already used. Indirect retention value (the app "feels" more polished) but not a feature they're buying on its own.
- 🩺 Patient: No downstream patient-safety or clinical-outcome effect — this only restyles how already-approved, already-redacted audit data is displayed to staff. No new fields are exposed; the existing `AUDIT_FIELD_ALLOWLIST` redaction in `apps/api/src/queries/auditLog.ts` is untouched and unbypassed.
- 🚀 NeoCRM/Platform: **platform** — `EntityHistoryPanel.vue` is already entity-type-agnostic (driven by an `endpoint` prop, no per-tenant or per-entity branching), reused as-is across Patient/Practitioner/Organization detail views. Restyling it once benefits every current and future white-label tenant identically; nothing here is specific to the current tenant's data or workflow.
- ⚖️ Compliance: No early flags. This is presentation-only over data that is already delivered through the existing, already-reviewed redaction allowlist in `auditLog.ts`. No new `audit_log` reads, no new fields, no new backend code.

### Medical-Industry Trend Check
n/a — internal change (rep-facing audit/history UI polish, not an HCP-engagement or patient-journey surface).

### Acceptance Criteria
- [ ] The History tab on Practitioner, Patient, and Organization detail views renders history entries as a vertical timeline: a colored icon per entry, connected by a continuous line, instead of the current plain `<ul>` list.
- [ ] Icon + color are keyed by `entry.action` (`create` → green/plus, `update` → blue/pencil, `delete` → red/trash, `restore` → amber/refresh, `read` → neutral/eye), via a new small pure-function util (`historyLabels.ts`), matching the existing `hcoLabels.ts`/`hcpLabels.ts` icon/color-mapping convention.
- [ ] `entry.entity_type` (currently a raw, untranslated PascalCase string like `TreatmentPlan`) is rendered through a new i18n-backed label instead, consistent with CLAUDE.md's "all copy in i18n JSON" rule — added to `en.json` first, then `pl.json`/`mx.json`.
- [ ] No behavior change to data fetching: `EntityHistoryPanel.vue` keeps its existing `endpoint` prop contract and stays entity-type-agnostic — no new props, no new backend calls, no changes to `apps/api/src/queries/auditLog.ts` or its routes.
- [ ] Existing states (loading, error, empty, lead-source banner) are preserved with equivalent behavior in the new layout.
- [ ] `changedFieldsSummary` (before → after diff) remains visible per entry, integrated into the new timeline item layout rather than removed.
- [ ] i18n parity holds — every new key exists in `en.json`, `pl.json`, and `mx.json`.
- [ ] A `.spec.ts` unit test covers the new `historyLabels.ts` mapping functions (icon/color per action).

### Open Questions
- [ ] None blocking. The attached mockup image's exact pixels aren't viewable in this run (image content, not text) — implementation follows the literal, unambiguous textual description ("colorful icons" + "a line") using the existing design system (`AppIcon.vue` + Vuetify's `VTimeline`, already available via `vite-plugin-vuetify` auto-import), the same single well-established pattern this kind of request maps to. Flagged in the completion comment for Łukasz to compare against his mockup and request adjustments if the exact spacing/color choices don't match his image.

### Hand-off
→ `/dev feat entity-history-timeline-redesign` — scope is clear, small, and self-contained (one shared component + one new util + icon/i18n additions).

---

## Second pass (2026-09-24): medical-grade + UX

Łukasz liked the first timeline and asked for a second pass aiming at "medical grade and UX max". Scope he picked (clarifying round, 2026-09-24): auditability, humanized sentences, WCAG 2.2 AA, clinical-event emphasis; day grouping, expandable details, polished states/motion. **Frontend only** — no endpoint, allowlist or migration changes.

### Acceptance Criteria
- [x] Every entry reads as one grammatical sentence per entity type × action, in EN/PL/MX (e.g. "Sleep study status changed to Device shipped" / "Zmieniono status badania snu na: Urządzenie wysłane"). Polish uses impersonal verb forms, so no guessing the author's gender.
- [x] Stored codes (status, type, specialty) render as translated labels, never raw DB values; empty values say "Not set"; record identifiers (`id`, `patient_id`) are never shown as "changes".
- [x] Entries are grouped under day headings (Today / Yesterday / full localized date), newest first; each row shows the local time.
- [x] Each entry expands into an audit panel: exact timestamp with seconds and time zone, author (or "System"), record type + short record id, short audit-entry id, and a before/after table of every allowlisted field.
- [x] Sleep study and treatment plan entries are marked clinical: a tinted card plus a text "Clinical" badge, so the emphasis never relies on color alone.
- [x] "Viewed" entries are visually quieter so they don't drown out real changes.
- [x] A11y: semantic `<section>`/`<h3>`/`<ol>` structure; decorative icons `aria-hidden`; inline diffs carry a screen-reader sentence ("Status changed from A to B"); the toggle is a real `<button>` with `aria-expanded`/`aria-controls`, a ≥24px target (WCAG 2.5.8) and a visible focus ring; the diff is a real `<table>` with a caption and header scopes.
- [x] Loading shows a skeleton with `role="status"` and a screen-reader label; entry fade-in, the skeleton pulse and the details transition all run only under `prefers-reduced-motion: no-preference`.
- [x] Dates go through `Intl` with the real BCP 47 tag (`mx` → `es-MX` via the new `intlLocale()` in `@i18n/language-options`).

### Deliberately not done (need a decision first)
- **CSV/PDF export of history**: exporting audit data off a rep device is a GDPR question (who may export, and whether the export itself must be audited, which needs a backend write). Left out until decided.
- **Merging runs of small edits into one entry**: for an audit trail every write should stay a distinct, individually referenceable entry, so this was skipped on purpose.
- **Region labels**: region codes (e.g. `PL-MZ`) are shown as stored. Humanizing them needs the territory lookup, and the History endpoint doesn't return it.
