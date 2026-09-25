## Refined User Story: Find-a-specialist map refactor + silent-error pattern (NEO-79)

**Classification**: feature. This is a patient-facing page redesign with open business questions (primary CTA, which clinics are public, which specialties), plus a cross-cutting error-handling pattern that touches both frontends.
**Raw input** (Łukasz, 2026-09-25, on dev.neosleepcare.com): the map loads but shows "No se pudieron cargar los especialistas" with nothing in the browser console ("totalnie źle zrobiona obsługa błędów"). The map "jest już mocno stara, nasze API mocno się zmieniło", so it should be refactored to the quality of the rest of the app. Also audit the codebase for the same silent-error pattern.

**Status of this pass**: design only. The product owner asked to see the design first. Two layout options, both as mockups, are in the NEO-79 artifact, and Option A is recommended. No production code changes until Łukasz picks an option and answers the open questions below.

### As a person in Mexico who snores or suspects sleep apnea, I want to find a nearby dentist trained in dental sleep medicine and contact them in one tap, so that I can book an assessment without having to understand the medical system first.

### Stakeholder Notes
- 👤 User: an anxious patient (or their partner), usually on a phone and often late at night. The job is "who is near me and how do I call them". Today they get a map plus cards with no call, directions or website action, and search that misses Spanish terms.
- 🏢 Client: the page is NeoSleep's own patient-acquisition funnel, and commission depends on referrals that convert. Each partner clinic expects to be listed accurately (name, address, doctor, contact).
- 🩺 Patient: indirect. A wrong or stale listing, such as a test clinic, a wrong phone number or a wrong country, delays access to treatment. The page must never imply a diagnosis. The copy stays "a dentist can assess you".
- 🚀 NeoCRM/Platform: the endpoint is already tenant-scoped (`tenantSlugFromHost`). Specialty labels should come from the tenant's `lookup` table rather than hardcoded strings, and branding stays on website tokens, so the page is reusable for future white-label tenants. The error-handling pattern is platform-wide.
- ⚖️ Compliance:
  - "Near me" geolocation must stay in the browser. Only distance is computed client-side, and nothing is sent to the server. This needs a line in the privacy notice (LFPDPPP/GDPR).
  - Doctor photos need consent before they are shown.
  - The diagnostics endpoint must never receive form field values or patient PII: send only message, stack, path, status and requestId.

### Medical-Industry Trend Check
- AADSM's public "Find a Qualified Dentist" directory (2,400+ dentists) lets patients search by name, state or ZIP. It serves both the public and physicians looking for referrals, and frames oral appliance therapy as "delivered by qualified dentists in coordination with physicians". This supports a list-first directory with name and city search as the core, with the map as a secondary aid. Sources: https://dentalsleep.org/find/, https://www.aadsm.org/for_patients.php
- Google deprecated `google.maps.Marker` on 2024-02-21 (v3.56) in favour of `google.maps.marker.AdvancedMarkerElement`. The new markers are more accessible, but they require a Map ID. `@googlemaps/markerclusterer` renders advanced markers. Source: https://developers.google.com/maps/documentation/javascript/advanced-markers/migration

### Audit: current page vs current API
The API is `GET /api/v1/public/specialists` (`apps/api/src/routes/public.ts:40-51`, query in `apps/api/src/db/organization.ts:409-462`).
- Rate limit: 60 requests per 15 min per IP.
- Result limit: 100.
- Response includes: `id, name, address_line1, city, state, country_code, phone, website, google_link, specialties[], latitude, longitude, practitioners[{id,name,specialties[]}]`.
- A live check on dev (2026-09-25) returned 6 organizations: 3 real CDMX dentists, 1 CDMX test clinic, and 2 Warsaw test hospitals with no practitioners.

| Area | API offers | Page today (`apps/web/src/views/FindSpecialistView.vue`) | Gap |
|---|---|---|---|
| Phone | `phone` | Plain text | No `tel:` action; numbers are not normalized (Warsaw rows lack a country prefix) |
| Website | `website` | Not shown | Missing action |
| Directions | `google_link`, lat/lng | "Ver en el mapa" link | Should be "Cómo llegar" (a directions URL) |
| Specialties | codes (`dentist`) | Not shown | No labels. Search for "dentista" misses `dentist` because the SQL `LIKE` matches the English code. Labels exist in the tenant `lookup` table (`type='specialty'`) but the endpoint does not return them |
| Search | name, city, specialty code, practitioner name | Server round-trip on submit; input disabled while loading | Placeholder promises "código postal o dirección", which is not searched. Client-side filtering of ≤100 rows would avoid the 60/15 min limit and give instant results |
| Country | `country_code` | All countries on one map | The CDMX rows have `country_code='PL'`. City is stored three ways (`CDMX`, `CIUDAD DE MEXICO`, null) |
| Near me | lat/lng | None | Client-side haversine distance |
| Clustering | – | None | Needs `@googlemaps/markerclusterer` |
| List ↔ map | – | `mouseenter` sets `selectedId` only; map never pans; no touch or keyboard | Needs two-way sync |
| Map failure | – | `hasError = dataError \|\| mapError` hides the list too | Map and list need independent states |
| API failure | status, body `{error, code}` | One generic message, nothing logged | Needs a per-class message plus log and diagnostics |
| SEO | – | Title and description only | JSON-LD `Dentist`/`MedicalClinic` per listing; city landing pages later |
| Accessibility | – | Legacy markers are not keyboard reachable; result count not announced | The list is the accessible equivalent; add an `aria-live` result count |
| Caching | `Cache-Control: no-store, private` | – | Public data; could be `public, max-age=300` |

### Design options (mockups in the NEO-79 artifact)
- **Option A, split list + map (recommended).**
  - Desktop: list on the left, sticky map on the right.
  - Phone: list by default, with a "Lista / Mapa" segmented toggle. Map mode opens the tapped clinic's card in a bottom card.
  - Why recommended: the call action is visible immediately on every device; the page stays fully usable if Maps fails; the content is plain HTML for SEO and screen readers; there is no draggable-sheet complexity; and it suits 3–6 clinics per city.
- **Option B, map first.**
  - Desktop: full-width map with a floating search panel and a card grid below.
  - Phone: full-screen map with a horizontally swiping card carousel.
  - More striking, but mostly empty streets with today's data. It loses its main element when Maps fails, and a draggable sheet is harder to make accessible.

Both options share the same states: loading skeleton; empty result with a waitlist CTA (`/contact?type=patient&city=…`); network error; 5xx with a short request reference; 429; and "map unavailable, list still works". Both also cluster markers when zoomed out.

### Acceptance Criteria (for the implementation ticket, once an option is chosen)
- [ ] The page renders the list from the API even when the Google Maps script or key fails, and the map area shows its own "map unavailable" message.
- [ ] A failed specialists request shows a message that depends on the error class:
  - network/CORS → "check your connection"
  - 429 → "wait a moment"
  - 5xx or unparseable response → "problem on our side" plus a short request reference
  - Every class writes one `console.error` with context and one row to `platform.diagnostics`.
- [ ] The search field filters loaded results client-side as the user types, matching clinic name, city, neighbourhood, practitioner name and the translated specialty label. Searching "dentista" in `mx` finds dentists.
- [ ] Specialty chips are generated from the data and labelled via i18n or lookup labels, never hardcoded in the component.
- [ ] Each card shows name, specialty label, address, practitioners and (when location is granted) distance. Actions: call (`tel:`), directions and website, and an action is hidden when its field is null.
- [ ] Selecting a card pans the map to and highlights its marker. Selecting a marker scrolls to and highlights the card. Both work with touch and keyboard.
- [ ] Markers use `AdvancedMarkerElement` and cluster when zoomed out, and the initial view fits the results for the page locale's country.
- [ ] Empty results show the waitlist CTA with the searched city pre-filled in the contact form.
- [ ] All new copy is added to `packages/i18n/en.json` first, with `pl.json`/`mx.json` parity. SCSS follows the website rules (BEM, `@layer components`, no scoped styles, responsive in `website-responsive.scss`), and dark mode is checked.
- [ ] JSON-LD for the listed clinics is present in the rendered page.
- [ ] Tests:
  - data mapping and filtering (unit)
  - each error state (component)
  - public endpoint integration test against a real Postgres (no mocks), including the specialty-label and country filtering changes

### Open Questions (for Łukasz)
- [ ] 1. Should test/demo organizations ("Klinika Testowa", the two Warsaw hospitals) be public? Proposal: add an explicit `public_listing` flag on `organization`, or clean the data.
- [ ] 2. Which specialties should be filterable? Proposal: dentist, pulmonologist, ENT, with chips shown only when at least 2 distinct specialties are present.
- [ ] 3. What is the primary card CTA: call, WhatsApp, or "book through NeoSleep" (a lead in the CRM, trackable for commission)?
- [ ] 4. Should each locale show only its own country (mx → MX, pl → PL), with a "see other countries" link? This requires fixing `country_code` on the CDMX rows.
- [ ] 5. Is "Cerca de mí" (browser geolocation, client-side only) OK, together with a privacy-notice line?
- [ ] 6. Doctor photos or clinic logos: not in v1 unless consent and files exist?
- [ ] 7. Should the waitlist reuse the existing contact form (`?type=patient&city=`)? Proposal: yes, no new table.
- [ ] 8. City SEO landing pages (`/especialistas/cdmx`): proposal is a separate later ticket.
- [ ] 9. Should the shared error-handling pattern ship before the map refactor as its own ticket, or with it?

### Silent-error audit (report only, 2026-09-25)
Scope: `apps/web/src`, `apps/pwa/src`, `packages/ui`, `packages/stores`, `apps/api/client`, excluding tests.

- All 84 `catch` blocks in frontend code discard the error object. The only exception is the api-client network catch.
- Apart from the PWA diagnostic reporter, there are no `console.*` calls in either app.

**Why the console was empty.** `@neo/api-client` already logs network errors and non-2xx responses (`apps/api/client/src/index.ts:51`, `:58`), so the silent failure was not an HTTP error. Two paths fit:
1. With no API base URL, the request hit the static website host, which returned the SPA HTML with a 200. `res.json()` then threw, and `FindSpecialistView.vue:279` swallowed it.
2. The Google Maps load failed. It was swallowed at `:211` and surfaced through the merged `hasError` (`:176`) as "could not load specialists".

**Diagnostics today**
- `POST /api/v1/diagnostics` (`apps/api/src/routes/diagnostics.ts:34-77`) is unauthenticated and live on dev/prod.
- It has no dedicated rate limiter. It shares the global 1000 requests per 15 min.
- Only the PWA reports to it: `useDiagnosticReporter.ts` for global errors, and `useApi.ts:199-226` for non-2xx responses.
- The website has no global error handler at all (`apps/web/src/main.ts`).
- The server generates `X-Request-ID` (`middleware/requestId.ts:8-11`) but never returns it, and the api-client drops the error `code`. Client and server records therefore cannot be correlated.

| Severity | Location | What happens | Fix |
|---|---|---|---|
| High | `apps/web/src/views/FindSpecialistView.vue:211`, `:176`; `apps/web/src/composables/useGoogleMaps.ts:32-34`, `:47` | Maps failure swallowed, blamed on the specialists data, and hides the list | Separate map state; log and report |
| High | `apps/web/src/views/FindSpecialistView.vue:279`; `apps/web/src/utils/api.ts:6` | JSON parse errors and `HTTP n` swallowed across retries; an empty `VITE_API_URL` silently falls back to same-origin | Log with status, content-type and URL; a missing API base should fail loudly at build time |
| High | `apps/web/src/main.ts` | No `errorHandler`, `window.onerror` or `unhandledrejection` on the public site | Share the reporter via a package and install it in web |
| Medium | `apps/web/src/views/ContactView.vue:270`, `apps/web/src/views/EventoView.vue:529` | web3forms lead submissions fail with no trace, so leads can be lost | Log and report with status and `data.message` |
| Medium | `apps/web/src/components/BookingModal.vue:276`, `:398` | All non-409 booking failures become one generic message | Per-status message |
| Medium | `apps/pwa/src/composables/useEntityList.ts:213`; HCO/HCP/Lead/User detail views (`:425`/`:533`/`:733`/`:451`) | Any error is treated as "offline" and stale cache is shown | Treat only `TypeError`/`AbortError` as offline; report the rest |
| Medium | `packages/ui/src/composables/useLoginFlow.ts:52-54`, `:76`; `useResetPasswordFlow.ts:31-57`; `useChangePasswordFlow.ts:35-40`; `useForgotPasswordFlow.ts:39` | 403/400/5xx show "Something went wrong" or "invalid link"; server messages dropped | Explicit status mapping |
| Medium | `apps/pwa/src/views/PartnerRegistrationView.vue:566-571` | Any failure shows "invalid invite" | Show "invalid" only on 404/410 |
| Medium | `apps/pwa/src/views/AuthCallbackView.vue:38-50`; `PatientQuestionnaireView.vue:203-210` | All causes collapse into one state | Keep status and code; specific message |
| Medium | `packages/stores/src/auth.ts:96` | A network blip during the boot session check logs the user out | Distinguish network errors from 401 |
| Medium | `apps/pwa/src/composables/usePartnerConnection.ts:39-41` | 5xx or network error shown as "not connected" | Explicit error state |
| Medium | 13 PWA load panels, 16 save paths, `TerritoriesView.vue:161`/`:182`, `PresentationsView.vue:413`, `PatientStudiesPanel.vue:583-596` | Generic message or no toast; never reported | Shared `reportCaught(err, ctx)` |
| Medium | `apps/pwa/src/composables/useApi.ts:87` | Token refresh fetch has no timeout | AbortSignal timeout |
| Medium | `apps/api/src/middleware/requestId.ts:8-11`; `apps/api/client/src/index.ts:56-59` | Request ID not returned; error `code` dropped | Return and expose `X-Request-ID`; pass `code` and `requestId` through |
| Low | ~30 sites | Storage guards, caret guards, animation promises, documented fallbacks | Keep; annotate with `// benign:` |

**Proposed single pattern**
1. The api-client returns a typed `ApiError { kind: network | timeout | http4xx | rateLimited | http5xx | badResponse, status, code, requestId, path }`.
2. Every catch calls one `reportCaught(err, { where, extra })`. It writes `console.error` with context and POSTs to `/api/v1/diagnostics` with `request_id`. It dedupes within 5 s and queues while offline. The endpoint gets its own rate limiter first.
3. The user-facing message is chosen by `kind`:
   - network → check your connection
   - 4xx → the server message (i18n)
   - 429 → wait
   - 5xx or badResponse → "our side", plus a short reference
4. The global reporter (PWA only today) moves to a shared package and is installed in apps/web too.
5. A lint rule bans empty `catch {}` without a `// benign: <reason>` comment.

### Hand-off
→ Łukasz: choose Option A or B and answer the open questions (the artifact linked on NEO-79).
→ `/arch assess` for the shared error pattern (a package location for `reportCaught`, and API-client changes) and for the `public_listing` flag if chosen.
→ `/dev feat find-specialist-map` after the decisions above.
