## Refined User Story: One error-handling pattern for web + PWA (NEO-81)

**Classification**: feature. It is cross-cutting: it touches the API client, both frontends, shared packages, the API server and the lint config, and it changes what users see when something fails. Scope was decided by the product owner on the ticket, so no clarifying round was run.
**Raw input** (Łukasz, 2026-09-25, on dev.neosleepcare.com): the website's specialist map failed with nothing in the browser console. "totalnie źle zrobiona obsługa błędów — napraw i sprawdź, czy gdzieś jeszcze nie ma podobnego rozwiązania". This ships first, as its own ticket, before the NEO-79 map refactor, which will reuse it.

### As the product owner (and as any rep or patient hitting a failure), I want every failure to leave a trace (console + diagnostics) and to show a message that says what actually went wrong, so that problems are found and fixed instead of silently losing leads or showing "offline" for a server bug.

### Stakeholder Notes
- 👤 User:
  - A rep who sees "Network problem" while online, when the real cause is a server error, loses trust and retries forever.
  - A patient on the website who gets a generic message cannot tell whether to wait or try later.
  - The fix is a message chosen by error class: offline, server problem, not found, rate limited, unexpected.
- 🏢 Client: the tenant cannot afford lost patient leads. Web3forms submit failures on the contact and event pages must be recorded, and support needs a reference (request ID) to find a failure in server logs.
- 🩺 Patient: indirect. A silently failed "contact me" submit delays care. The page must still tell the patient that sending failed, which it already does, and now it also leaves a trace.
- 🚀 NeoCRM/Platform:
  - One shared pattern, the typed `ApiError` plus `reportCaught`, in shared packages. Every white-label tenant gets it for free.
  - The `X-Request-ID` header ties browser reports to API logs.
- ⚖️ Compliance:
  - Diagnostics are an unauthenticated public endpoint, so they need a dedicated rate limiter.
  - Reports must never include request bodies, tokens, emails, names or phone numbers (GDPR/LFPDPPP).
  - Only message (scrubbed), stack, where, error class, HTTP status, API code, request ID, API path without query string, page path without query/fragment, and app version are sent.

### Medical-Industry Trend Check
- n/a — internal/infra change.

### Acceptance Criteria
- [x] `@neo/api-client` exports `ApiError` with `kind` ∈ `network | timeout | client | rate_limited | server | bad_response`, plus `status`, `code` (from the API's `{error, code}` body), `requestId` (from the `X-Request-ID` response header), `path` and `method`. `apiFetch` throws `ApiError` (network/timeout) on transport failure and still returns the `Response` for HTTP errors, so existing callers keep working. `readJson(res)` throws `ApiError` for a non-2xx response or for a 2xx response that is not valid JSON (e.g. an SPA HTML page).
- [x] One `reportCaught(err, { where, extra })`:
  - It writes one `console.error` with context and POSTs to `/api/v1/diagnostics`.
  - It dedupes the same error within 5 s.
  - It never throws.
  - Unit tests prove that no email or phone number and no query string reaches the payload.
- [x] Global handlers (Vue `errorHandler`, `window` `error`, `unhandledrejection`) are installed in both apps/pwa and apps/web through one shared installer.
- [x] User-facing messages come from the error class, with keys in `common.error.*` in en/pl/mx:
  - The PWA lists and detail views fall back to the offline cache only for `network`/`timeout`.
  - A server error shows "problem on our side" with a short reference. It no longer shows "offline".
- [x] Every audited catch in apps/web, apps/pwa, packages/ui and packages/stores does one of two things:
  - it calls `reportCaught` (and shows a class-appropriate message where a user is waiting), or
  - it carries a `// benign: <reason>` comment.
- [x] Failed Web3forms submits on ContactView and EventoView are reported. The report carries the status and the provider message, never the form fields.
- [x] Find-a-specialist: a Google Maps load failure no longer hides the clinic list. The map area says "map unavailable", and a data failure shows a message chosen by error class. No redesign (NEO-79).
- [x] API:
  - Every response carries `X-Request-ID`, and CORS exposes it. An incoming `X-Request-ID` is reused only when it is a safe token (≤ 128 characters from `[A-Za-z0-9._-]`).
  - `POST /api/v1/diagnostics` has its own per-IP rate limiter, and the global `apiLimiter` is unchanged.
  - Integration tests run against a real Postgres.
- [x] ESLint fails on an empty `catch {}` and on an empty `.catch(() => {})` callback unless it contains a `// benign:` comment. `pnpm lint` passes.
- [x] `pnpm i18n:parity`, typecheck, lint and the affected test suites pass.

### Open Questions
- [ ] Offline queue for diagnostics reports: the audit proposed queueing reports while offline. It is not done here, because reports sent while offline are dropped, the console still has them, and reports while online are the actionable ones. Revisit if field reps report issues we cannot see.
- [ ] `stores/auth.ts` boot session check: a network blip no longer logs the user out, because the user is kept and the next request retries. Confirm with Łukasz that this is the wanted behaviour for reps (it matches the refresh-token logic in `useApi.ts`).

### Hand-off
→ `/dev` directly: scope was set by the ticket. The plan is below.

---

## Implementation plan

1. **api-client** (`apps/api/client/src`)
   - `errors.ts`: `ApiError`, `classifyStatus`, `toApiError(unknown)`, `apiErrorFromResponse(res)` and `readJson(res)`.
   - `createApiFetch` wraps transport failures in `ApiError` and passes `{ code, requestId }` to `onError` as an optional fifth argument, which is backwards compatible.
   - `report.ts`:
     - `configureErrorReporting({ getApiBase, app, appVersion })`, `reportCaught`, `reportApiResponse` (used by the PWA's `onError`), `scrubPii`, `sendDiagnostic`.
     - It is framework-agnostic, so packages/stores and packages/ui can use it. api-client is the one package that packages may import from apps (dependency-cruiser exception).
2. **@neo/ui** (`packages/ui/src/errors`)
   - `installGlobalErrorHandlers(app)` (Vue `errorHandler`, window `error`, `unhandledrejection`).
   - `errorMessageKeys(err)` returns `{ title, body, reference? }` i18n keys by class.
   - `useErrorMessage()` resolves these with `t()`.
3. **PWA**
   - Move `sendDiagnostic` / `useDiagnosticReporter` to the shared reporter, and `main.ts` calls `configureErrorReporting` + `installGlobalErrorHandlers`.
   - `useEntityList` and the HCO/HCP/Lead/User/Patient detail views use the cache only on `network`/`timeout`, and otherwise report the error.
   - `AppErrorState` and `ItemDetailLayout` accept an `error` prop and derive title and subtitle from it.
   - The refresh token call gets a timeout.
   - Every catch site is fixed.
4. **Web**
   - `main.ts` installs the same handlers.
   - `utils/api.ts` warns loudly when `VITE_API_URL` is missing in a production build.
   - FindSpecialistView: separate map and data states, class message, `readJson`.
   - ContactView/EventoView/BookingModal/ForProfessionalsView are reported.
   - Storage guards are annotated as `// benign:`.
5. **packages/stores / packages/ui**
   - `auth.ts`: a network error on session check keeps the user.
   - Login/reset/change/forgot flows show the network message only for network errors, and otherwise a generic message plus a report.
   - Storage guards are annotated as `// benign:`.
6. **API**
   - `requestId` middleware sets the response header and validates incoming IDs.
   - CORS gets `exposedHeaders: ["X-Request-ID"]`.
   - `diagnosticsLimiter` allows 60 requests per 15 min per IP on `POST /diagnostics`.
   - Integration spec against real Postgres.
7. **Lint**
   - A local ESLint rule, `neo/no-silent-catch`, is registered in `eslint.config.mjs` for all TS/Vue files.
   - Any existing empty catch in apps/api gets annotated.
8. **Tests**
   - api-client: `errors.spec.ts`, `report.spec.ts`.
   - ui: `errorMessage.spec.ts`.
   - Updated PWA specs (`useApi`, `useEntityList` if present).
   - API: `requestId-diagnostics.spec.ts`.

---

## As built (differences from the plan above)

- **Everything framework-free lives in `@neo/api-client`**: `ApiError`, `readJson`, `apiErrorFromResponse`, `toApiError`, `isOfflineError`, `reportCaught`, `reportFailedResponse`, `configureErrorReporting`, `installGlobalErrorHandlers` and the class→i18n-key mapping (`errorClassOf`, `errorMessageKeys`, `errorBodyKeyOr`, `describeError`, `describeErrorInline`).
  - Reason: apps' plain `.ts` entry points (`main.ts`) type-check with `tsc`, which cannot follow `@ui`'s `.vue` re-exports.
  - `installGlobalErrorHandlers` is typed structurally against Vue's `App`, so the package stays Vue-free.
- **`@neo/ui` only adds the Vue bindings**: `useErrorText()` and `useErrorTextFor(ref)`.
- **The PWA adds `showErrorToast(err)`** (`apps/pwa/src/composables/useErrorToast.ts`), for catches that had no user feedback at all.
- **Lint rule scope**: frontend source only (apps/pwa, apps/web, apps/api/client, packages/*). Specs are excluded. apps/api is left for a follow-up.
- **Server 5xx on `handleErrors: false` requests**: these were already recorded server-side (`errorHandler` writes every 5xx to `platform.diagnostics` with its request id). Only the call sites whose error state now needs the typed error also report them client-side.
- **`window.error` ignores "ResizeObserver loop …"**. It is browser noise that fired on every PWA page load.

## How to use it (e.g. NEO-79)

```ts
import { readJson, reportCaught, isOfflineError, reportFailedResponse } from "@api";
import { useErrorTextFor } from "@ui"; // .vue only

const failure = ref<unknown>(null);
const failureText = useErrorTextFor(failure); // { title, body, reference } | null

try {
  const res = await apiFetch("/api/v1/public/specialists");
  const data = await readJson<{ specialists: Specialist[] }>(res, { path: "/api/v1/public/specialists" });
} catch (err) {
  reportCaught(err, { where: "web.FindSpecialistView.fetchSpecialists" }); // console + diagnostics
  failure.value = err;                                                        // UI picks the message by class
}
```

- **Degraded but working** (e.g. the map failed while the list works): `reportCaught(err, { where, level: "warn" })`.
- **`handleErrors: false` + `!res.ok`**: use `failure.value = await reportFailedResponse(res, { where })`.
- **Offline cache fallback**: only when `isOfflineError(err)`.
- **Intentionally ignoring an error**: `catch { // benign: <reason> }`. The lint rule requires the comment.
- **Privacy**: never put form values or names in `extra`. Strings there are scrubbed, but pass ids and enums only.
