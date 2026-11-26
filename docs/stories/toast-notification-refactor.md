## Refined User Story: Toast Notification Refactor

**Classification**: feature
**Raw input** (NEO-8, Łukasz, original Polish, lightly trimmed):
> globalnie zrefaktorowac notyfikacje. tak to wyglada teraz - powinien byc tam x po prawej stornie (tera jest tak ze klik w notyfikacje ja kasuje.)
>
> chcialbmy uzyc bardziej natywnych notyfikacji, teraz tam jest duzo customu, a chcialbym bardziej wrocic do roots - zrob tam mocny refaktor - kod ma byc czytelny, i prosty.
>
> jak pojawiaja sie nowe notyfikajce: to zrob stock, ze najnowsza przehcodzi troche wyzej. notyfikacja ma byc widoczna przez 8 sekund: chcialbym zeby to bylo pokazane jako border bottom, ktroy sie wypelnia od 0 do 100% width,
>
> motyw dopasuj do nowoczensje aplikacji medycznej,
>
> na desktop notyfikacje maja wjezdzac z prawej storny, maja byc aligned to the right also. znikaja tez do praej storny: animacja ruchu i opacity sie zmienia 0-100
>
> na mobile: centered i wtedy pojawiaja sie z dolu, 8 sec a jak znikaja to tez maja znikac w dol. na mobile mozna zamknac na 2 sposoby: albo x albo sciagajac w dol.
>
> byloby wspaniale jakby notyfiakcja dostawala ikone od koloru: czy to info, czy error, itd.

### As a rep/KAM/FFM/MSL/admin using apps/pwa, I want the toast notification system redesigned with explicit dismissal, multi-toast stacking, an 8s duration with visible progress, and platform-appropriate entry/exit animation, so that transient feedback (save success, validation error, etc.) is clearer, more controllable, and doesn't feel accidental or dated.

### Stakeholder Notes
- 👤 User: every field-app role hits this dozens of times a day (any form save, API error, PCF submit). Today a stray tap dismisses feedback before it's read; the fix (explicit X, longer duration, visible countdown) reduces missed/misread feedback with no new workflow to learn.
- 🏢 Client: purely cosmetic/UX polish on the tenant's white-labeled app — improves perceived quality ("modern medical app" ask) but isn't tied to any specific tenant's contract terms. Benefits all tenants equally, no client-specific config needed (uses existing DB-driven branding tokens already, nothing hardcoded per tenant).
- 🩺 Patient: no downstream patient effect — this only changes how UI feedback strings are displayed, never what data is shown or how it's submitted. One behavior change worth flagging: the current implementation never auto-dismisses `error`-type toasts (they require a manual dismiss); this ticket asks for a uniform 8s duration with no exception carved out. See Open Questions.
- 🚀 NeoCRM/Platform: reusable improvement across the whole PWA (single global component), not tenant-specific — a cleaner, better-tested toast primitive is a small piece of the "white-label ready" polish bar. No schema/architecture impact.
- ⚖️ Compliance: no early flags. Confirmed via codebase exploration: `useNotifications.ts`/`AppNotifications.vue` only ever render caller-supplied `message: string` + `type` enum — no patient/HCP data, no DB/API calls, no auth surface. This is explicitly separate from `useNotificationCenter.ts`/`AppNotificationCenter.vue` (the backend-backed bell/inbox, ADR-012), which is out of scope and untouched.

### Medical-Industry Trend Check
n/a — internal UI/UX refactor, no external clinical or pharma-CRM benchmarking applies.

### Acceptance Criteria (testable)
- [ ] Clicking anywhere on a toast no longer dismisses it; dismissal is only via a visible close (X) button on the toast's right side (reusing existing `notification.dismiss` i18n key as its `aria-label`).
- [ ] Multiple toasts can be visible simultaneously (stacked), instead of today's one-at-a-time-with-hidden-queue; a new toast enters at the anchor edge and existing toasts animate to make room (using Vue's built-in `<TransitionGroup>` move-transition, not custom positioning math — this is the concrete "less custom, more native" change, matching the ask directly since Vuetify has no snackbar-queue primitive that supports the custom directional/swipe/progress-bar requirements below).
- [ ] Every toast auto-dismisses after 8000ms (all types, including `error` — see assumption below) unless dismissed earlier by the user.
- [ ] Each toast shows a `border-bottom` progress indicator that fills from 0% to 100% width over the 8s duration (replacing the current `scaleX` bar, and no longer skipped for `error`).
- [ ] Each toast displays an icon determined by its `type` (`info`/`success`/`warning`/`error`), added to the existing `AppIcon.vue` icon map (which currently only has `info-circle`) rather than introducing a new icon system.
- [ ] Desktop (≥ `MOBILE_BREAKPOINT` = 768px, reusing the existing constant/pattern from `useLayoutState.ts`): toasts anchor bottom-right, slide in from the right, right-aligned; exit by animating back to the right with opacity 100→0.
- [ ] Mobile (< 768px): toasts anchor bottom-center, slide up from the bottom on enter; exit by sliding back down. Dismissible via the X button or by dragging down past a threshold (extending the existing touch-threshold pattern, currently swipe-up-only, to swipe-down).
- [ ] Visual theme (colors/spacing/elevation) reads as a modern medical-app design, consistent with the app's existing design tokens (`packages/brand`) rather than introducing new ad hoc colors.
- [ ] Public API of `useNotifications()` is unchanged: `{ notifications, current, show(message, type?, key?), dismiss(id), dismissCurrent() }` — all ~50 existing call sites (`useApi.ts`, `useEntitySubmit.ts`, and the various views/components) and the existing `useApi.spec.ts` / `useOrthoApneaOrderWizard.spec.ts` assertions against `notifications.value`/`current.value` keep passing unmodified.
- [ ] `z-index: 10010` (or equivalent stacking behavior) is preserved so an error toast raised from `useApi.ts` still displays above open dialogs (e.g. `FormRenderer`'s error flow, which sits above Vuetify's `.v-menu` at 10002).
- [ ] `useNotifications.spec.ts` continues to pass; new/updated tests cover the close-button dismissal, multi-toast stacking, and the 8s timeout behavior.

### Open Questions
- [ ] None blocking. One explicit assumption is being made and flagged here rather than treated as a silent guess: the ticket's "8 seconds" duration is applied uniformly to `error` toasts too (today they persist until manually dismissed). This is judged low-risk because the new explicit X button and progress bar make dismissal state clearer either way, and the change is easily reverted per-type later if Łukasz disagrees after seeing it in practice.

### Hand-off
→ `/dev` — scope is clear, self-contained (two files + their tests + one icon addition), no schema/architecture impact.
