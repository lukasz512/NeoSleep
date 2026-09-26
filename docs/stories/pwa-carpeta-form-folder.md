## Refined User Story: PWA "Carpeta" form folder (edit + create)

**Classification**: feature. It changes every entity form, so it is visual and structural, but it changes no data.
**Raw input**: "ten border dotyka teraz btn - to niedopuszczalne. pokaz mi 3 propozycje dla calych widokow edit … ma przypominac kartke, plytke" → Łukasz picked variant C "Carpeta" (https://claude.ai/artifact/LL9B9HnsGfcJNZpFj9iptW#c). Scoping answers came through a decision form (https://claude.ai/artifact/XS8BD5QzFsHZ7Ao6EzXFuw). Linear: NEO-92. Builds on NEO-85.

### As a rep / doctor / manager editing or adding a record, I want the form to open like a patient folder, so that I always see whose record I'm changing, where I am in a long form, and what I haven't saved yet

### Stakeholder Notes
- 👤 User: Long forms (patient, HCP) no longer feel like one endless column. Section jumps and unsaved-change dots cut hunting. On phones the sheet stays thumb-reachable and the chips replace the spine.
- 🏢 Client: White-label safe. Tints mix from the tenant primary. Sections are config (a `section` key per field), so a tenant-specific form needs no component code.
- 🩺 Patient: No downstream effect. The data, validation and payload are unchanged.
- 🚀 NeoCRM/Platform: One shell (AppFormDialog + FormRenderer) serves all FormRenderer forms. Create and edit are the same component, which they already were; the folder makes that visible.
- ⚖️ Compliance: Accessibility. Sections are `<section>`s labelled by their heading. The index is a `<nav>` with `aria-current="location"`. The change counter is `aria-live="polite"`. Movement honours reduced motion. There are no GDPR flags: the spine shows only what the record header already shows.

### Decisions (Łukasz, 2026-09-26, decision form)
- A1: forms with ≥ 2 sections (patient, HCP, HCO, lead, user) get the folder. Shorter forms stay one sheet in the same style.
- A2: add and edit are **the same view**. The spine starts empty and fills in live as fields are typed.
- A3: the OrthoApnea wizard and the questionnaires move onto this skeleton later, in their own ticket.
- B1: one long sheet, with a scroll-spy index. Clicking scrolls to a section.
- B2: the spine shows the full identity (avatar, name, the record header's detail line, status pill).
- B3: a dot marks each section with unsaved changes, and the actions row carries a change counter.
- C1: no serif. The system font stays; hierarchy comes from weight and size.
- C2: stacked on NEO-85 (merge order: form-scroll fix → NEO-85 → NEO-92).

### Acceptance Criteria
- [x] Scrolled content fades out over 20px under the header / above the actions instead of touching a hairline. This covers every AppFormDialog, and e2e measures the mask and the header/body seam.
- [x] Desktop (≥ 960px): a two-column folder. The spine holds the identity and section index; the page holds the header (title + X), the sections with headings and the actions.
- [x] Tablet (600–959px): like the phone (section chips, avatar in the header, no spine) but still a floating tile with margins and all corners rounded (Łukasz, 2026-09-26).
- [x] Phone (< 600px): a bottom sheet with section chips under the header, and no spine.
- [x] The index follows the scroll. A click scrolls to the section, and smooth scrolling is dropped under reduced motion.
- [x] Changed sections show a dot, and the actions row shows "Unsaved changes: n".
- [x] Create mode: the spine name shows a placeholder until typed, then updates live.
- [x] Every field of the five folder forms names its section (unit spec). Section labels exist in EN/PL/MX.
- [x] Existing dialog e2e specs (dialog-scroll, dialog-header) stay green in Chromium, Firefox and WebKit.

### Open Questions
- [ ] After saving a new record, should the view switch straight into editing it? Current behaviour is kept: the dialog closes and the toast shows, as before. This was asked in the decision-form thread.
