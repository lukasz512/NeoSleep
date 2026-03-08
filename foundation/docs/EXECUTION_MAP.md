🔵 STAGE 0 – Engineering Foundation (Week 1)

✅ 0.1 Repo stability
	•	ESLint + Prettier działa
	•	Strict TypeScript działa
	•	CI blokuje błędy
	•	PR template wymusza checklistę
	•	Renovate aktywne

DoD:
CI failuje jeśli brak testów.

⸻

🔵 STAGE 1 – Secure Core (Week 2–3)

✅ 1.1 BFF minimal ready
	•	Express/Fastify running
	•	Env validation (zod/env schema)
	•	Structured logger
	•	/health endpoint

✅ 1.2 Google OIDC
	•	Login redirect
	•	Domain validation
	•	Session cookie (httpOnly)
	•	/auth/session
	•	RBAC middleware
	•	Region enforcement

DoD:
Rep loguje się i widzi tylko swoje dane (mockowane).

⸻

🔵 STAGE 2 – Data Layer (Week 3–4)

✅ 2.1 Notion Adapter
	•	CRUD abstraction
	•	ID mapping
	•	Cache TTL
	•	Rate limit retry

✅ 2.2 Leads/HCP/HCO endpoints
	•	GET list
	•	GET detail
	•	Region filter

DoD:
Rep app może wyświetlić prawdziwe dane z Notion.

⸻

🔵 STAGE 3 – Rep App Core (Week 4–6)

✅ 3.1 App shell
	•	Layout
	•	Router guard
	•	Session bootstrap
	•	Error states

✅ 3.2 CRM views
	•	Leads list + search
	•	HCP view
	•	HCO view
	•	Google Maps deep link

✅ 3.3 Meeting engine
	•	Start meeting
	•	Stop meeting
	•	Meeting context state

DoD:
Rep może przeprowadzić spotkanie online.

⸻

🔵 STAGE 4 – Offline Mode (Week 6–7)

✅ 4.1 Service Worker
	•	Asset caching
	•	PDF caching
	•	Version invalidation

✅ 4.2 IndexedDB queue
	•	PCF offline queue
	•	Slide events queue
	•	Retry on reconnect
	•	Sync status UI

DoD:
Rep może działać 30 min bez internetu.

⸻

🔵 STAGE 5 – Post Call Form Engine (Week 7–8)

✅ 5.1 Config schema
	•	Zod validation
	•	Tenant-config parsing

✅ 5.2 Dynamic form renderer
	•	Field types
	•	Required validation
	•	Error states

✅ 5.3 Submit flow
	•	Online submit
	•	Offline queue
	•	Success state

DoD:
PCF działa w 100% online/offline.

⸻

🔵 STAGE 6 – PDF Player + Tracking (Week 8–9)

✅ 6.1 Fullscreen PDF
	•	Page detection
	•	Time tracking

✅ 6.2 Engagement scoring
	•	Basic heuristic
	•	Event emission

DoD:
Widzisz eventy slide_viewed w backendzie.

⸻

🔵 STAGE 7 – i18n Automation (Week 9)

✅ 7.1 Extract pipeline
	•	Auto-add new keys
	•	CI enforcement

✅ 7.2 Unused detection
	•	_unused.json
	•	unusedSince metadata

✅ 7.3 Auto-translate PR
	•	Make webhook
	•	OpenRouter translation
	•	PR auto-create

DoD:
Nowy label → PR z tłumaczeniami generuje się automatycznie.

⸻

🔵 STAGE 8 – Email Engine (Week 10)

✅ 8.1 Provider setup
	•	DNS configured
	•	Verified domain

✅ 8.2 MJML system
	•	Template render
	•	Localization
	•	Tenant branding support

DoD:
Można wysłać magic link testowy.

⸻

🔵 STAGE 9 – Observability (Week 10–11)

✅ 9.1 Event API
	•	Batch endpoint
	•	Redaction

✅ 9.2 Sentry
	•	Frontend
	•	Backend
	•	Release tagging

DoD:
Błędy w rep app widoczne w Sentry.

⸻

🔵 STAGE 10 – AI Hub (Week 11–12)

✅ 10.1 Rep Copilot
	•	Prompt registry
	•	Endpoint
	•	Logging metadata

✅ 10.2 PCF draft
	•	Transcript input
	•	Field suggestions
	•	Confidence score

DoD:
Rep może powiedzieć co się stało → PCF się podpowiada.
