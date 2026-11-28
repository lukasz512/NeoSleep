## Refined User Story: Global search and AI palette (CORE-292)

**Classification**: feature
**Raw input**: A global search bar at the top of the app that opens a Cmd+K palette; "Ask AI" is the entry to the AI chat, which opens in a side panel (bottom sheet on mobile). Option A of the mockup. Calm transitions, UX, architect and QA input before building.

### As a staff user, I want to find a patient, doctor, clinic or page from anywhere with one shortcut, and (as admin) ask NeoSleep AI without leaving the page, so that I stop hunting through menus.

### Stakeholder Notes
- 👤 User: reps and admins jump to a record in two keystrokes; admin asks the platform questions in context.
- 🏢 Client: fewer clicks per visit; search respects territories, so no data leaks between reps.
- 🩺 Patient: no clinical effect; search returns names and labels only, never clinical fields.
- 🚀 NeoCRM/Platform: generic, config-driven (pages come from the router meta); the AI entry is gated by a capability, ready for doctors and patients later.
- ⚖️ Compliance: patient names must never reach logs (no query text in URLs, audit or logs). Stage 1 AI still receives no patient data.

### Medical-Industry Trend Check
n/a — internal navigation change.

### Decided by default (a test proves each)
- Transport: `POST /api/v1/search` with the term in the body, so names never land in access logs.
- The search handler calls the existing list queries (`GetPatientListQuery`, `GetPractitionerListQuery`, `GetOrganizationListQuery`), so scope is identical to the list pages. No new scope SQL.
- Limits: term trimmed, 2–100 chars, 5 per group, `Cache-Control: no-store`, own rate limiter per user.
- Matching: `%`, `_`, `\` literal; accent-insensitive (migration 071: `unaccent`, `pg_trgm`, immutable wrapper, GIN indexes, also in `create_tenant_schema()`); the list pages gain accent-insensitivity too.
- Results carry id, label, sublabel and region only. No DOB, phone, email or diagnosis.
- Audit stores term length and per-group counts, never the term.
- Pages come from `useVisibleNavRoutes()`; no hardcoded page list. Recent items store pages only, never names.
- AI entry rendered only when `canUseAi(role)` (derived from the `/ai` route roles); absent from the DOM otherwise; the API still returns 403.
- The ask/answer logic moves to `useAiConversation()`, shared by `AiChatView` and the palette.
- Trigger is a `<button>` pill (desktop) or 44px icon (phone), never an input; the app bar does not shift.
- Motion: brand easing `cubic-bezier(0.22, 1, 0.36, 1)`, 160 ms small, 280 ms large; opacity and transform only; `prefers-reduced-motion` → 80 ms opacity fades.

### Acceptance Criteria
- [ ] A rep never gets a patient, doctor or clinic outside their territory; a doctor only their own patients; for each role `/search` is a subset of the list endpoint for the same term.
- [ ] Tenant A never sees tenant B rows.
- [ ] Term under 2 or over 100 chars is rejected; `%` does not match everything; an injection string returns 0 hits; "jose" finds "José", "zolc" finds "Żółć", NFC and NFD behave the same.
- [ ] The 31st request in the window returns 429; the UI shows a countdown and keeps the text.
- [ ] No term or result name appears in audit_log or server logs.
- [ ] Cmd+K (macOS) and Ctrl+K toggle the palette with `preventDefault`; `/` opens it outside inputs; Esc closes (AI mode goes back to search first) and focus returns to the trigger.
- [ ] Combobox pattern: input `role=combobox` with `aria-activedescendant`, `listbox`, `option`; dialog is modal and focus-trapped; result counts announced in a live region; axe clean.
- [ ] A slow older response never overwrites a newer one; IME composition and double Enter are handled.
- [ ] Admin sees "Ask NeoSleep AI"; rep and doctor do not (not in the DOM); the answer renders as text.
- [ ] AI states: thinking, 429, 503 (no key), over 500 chars — localized in en, pl, mx.
- [ ] Desktop: 400 px side panel overlay; phone: bottom sheet (92 dvh, safe area, drag to dismiss) sharing one component and state.
- [ ] With reduced motion the computed transition duration is ≤ 80 ms and no transforms run.
- [ ] i18n parity en/pl/mx; no `v-html`.

### Open Questions
none (all settled by default above; the user already chose option A and the panel behavior)

### Hand-off
→ `/dev feat global-search-ai-palette` (TDD: API spec first, then component, then e2e)
