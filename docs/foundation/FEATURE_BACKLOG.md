# Neo CRM — Feature Backlog

> Lista zaplanowanych funkcji i modułów. Aktualizować przy każdej większej decyzji produktowej.
> Status: `planned` · `in_progress` · `done` · `deferred`

---

## Stage 2 — Real DB reads (IN PROGRESS)

| Feature | Status | Notes |
|---|---|---|
| Supabase connection (DATABASE_URL) | `planned` | Prerequisite for everything |
| Run migrations (000–001) | `planned` | platform + neosleep + fourseasons schemas |
| BFF routes read from real DB | `in_progress` | practitioner, encounter, lead |
| HCP list view (filterable) | `in_progress` | rep sees their HCPs per territory |

---

## Stage 3 — CRM Core Views

| Feature | Status | Notes |
|---|---|---|
| HCP profile page | `planned` | identity + specialties + visit history |
| Encounter / PCF flow | `planned` | create encounter, fill PCF after visit |
| next_visit_notes on HCP | `planned` | pulled from last encounter.next_visit_notes |
| Lead pipeline | `planned` | kanban or list, status transitions |
| Visit planner (weekly view) | `planned` | visit_plan table |
| Sample management UI | `planned` | sample_batch → stock → transaction per rep |
| Sample request flow | `planned` | rep requests → FFM approves → fulfilled |
| Voice-to-PCF | `planned` | rep records voice note → Whisper transcribes → PCF draft auto-filled; voice_note_url on encounter |
| GPS check-in | `planned` | rep checks in at HCP location (geofencing); checkin_location JSONB on encounter; FFM verification |
| Signature capture | `planned` | HCP signs sample receipt on phone screen; signature_url on sample_transaction; EFPIA required in many markets |
| Sample compliance alerts | `planned` | real-time warning when rep approaches EFPIA sample limit per HCP per quarter |
| CLM — Closed Loop Marketing | `planned` | slide_views JSONB on encounter_presentation; tracks which slides HCP saw + duration; feedback loop to marketing |
| EFPIA autopilot report | `planned` | one-click annual disclosure report from encounter.transfer_of_value + event attendee costs |
| GDPR HCP self-service dashboard | `planned` | HCP views own data (Art. 15 right of access), requests corrections/deletion |

---

## Stage 4 — FFM Dashboard & KPIs

| Feature | Status | Notes |
|---|---|---|
| FFM team view | `planned` | reps under manager, their visit counts |
| Target setting (FFM → rep) | `planned` | target table, period/metric/value |
| KPI dashboard | `planned` | kpi_snapshot for fast rendering |
| Territory heatmap (real-time) | `planned` | GPS check-in data + encounter history; white spots = low coverage |
| Events module | `planned` | event + event_attendee + EFPIA disclosure; works for pharma congresses AND FourSeasons hotel events |
| Gamification | `planned` | rep leaderboard, visit streaks, achievement badges; drives field force engagement especially MX/TH |
| Benchmarking (anonymized) | `planned` | "your team: 12 visits/week, industry avg: 15"; cross-tenant aggregate from kpi_snapshot |

---

## Stage 5 — Messaging & Automation

| Feature | Status | Notes |
|---|---|---|
| In-app chat (rep ↔ HCP) | `planned` | conversation + message tables ready |
| Patient chat (website ↔ AI ↔ consultant) | `planned` | same conversation/message tables; support_ticket for AI→human escalation |
| WhatsApp Business API integration | `planned` | webhook_event queue ready; LINE for TH market |
| SMS via Twilio | `planned` | same webhook_event queue |
| Email from app | `planned` | nodemailer already in BFF |
| Inbound message sync (webhook workers) | `planned` | webhook_event → conversation → message |
| Push notifications | `planned` | push_subscription + web-push library ready |
| Notification preferences | `planned` | app_config.notification_defaults |

---

## Stage 6 — AI & Personalization

| Feature | Status | Notes |
|---|---|---|
| pgvector extension (Supabase) | `planned` | enable in Supabase dashboard, zero migration needed |
| Embeddings for encounter notes | `planned` | semantic search: "find HCPs similar to Dr. X" |
| Embeddings for practitioner profiles | `planned` | same pgvector setup |
| AI insight: receptivity_score | `planned` | per HCP, predicted from visit history; ai_insight table ready |
| AI insight: next_best_action | `planned` | "visit now" / "send materials" / "let rest"; ai_insight table ready |
| AI insight: churn_risk | `planned` | HCP going cold prediction; ai_insight table ready |
| Pre-visit AI briefing | `planned` | rep opens HCP profile → AI generates 1-page brief: last visit, what to discuss, samples to bring |
| Rep coaching (AI summary) | `planned` | "your last 5 visits with Dr. Kowalski show..." — post-PCF coaching feedback |
| Medical literature assistant | `planned` | MSL enters topic → AI finds relevant studies → brief for HCP; ai_generation_log tracks all outputs |
| Dynamic segments (AI-refreshed) | `planned` | segment.is_dynamic=true + criteria JSONB |
| Automation rules engine | `planned` | trigger → condition → action (stub table ready) |
| Personalized presentation picker | `planned` | AI suggests slides based on HCP profile + CLM slide_views history |
| AI generation log | `planned` | ai_generation_log: full audit of every AI output (feature, model, tokens, cost, accepted/rejected) |

---

## Stage 7 — Patient D2C & Sleep Study Pipeline

| Feature | Status | Notes |
|---|---|---|
| Patient registration (Google + WebAuthn + magic link) | `planned` | patient.google_sub + patient_webauthn_credentials; same modern auth as reps |
| Patient portal (website) | `planned` | order products, view study results, chat, select dentist |
| Purchase flow | `planned` | purchase_order + purchase_order_item + Stripe integration |
| Supplier auto-dispatch | `planned` | on order paid → BFF calls supplier API (Biologix etc.) with shipping info |
| Sleep study lifecycle | `planned` | sleep_study: device_shipped → results_received → interpreted by doctor |
| Automatic results → doctor routing | `planned` | sleep_study.interpreted_by; doctor gets notification when results arrive |
| Patient dentist selection | `planned` | patient picks from practitioner list (specialty=dentist); dentist notified |
| OA referral + 3D scan flow | `planned` | oa_referral: scan_supplier → scan → OA manufacturer → delivered |
| Patient ↔ consultant chat | `planned` | conversation/message (AI triage first, support_ticket for escalation) |
| HCP portal (magic link auth) | `planned` | magic_link_tokens ready; UI not started |
| HCP self-service: view visit history | `planned` | GDPR Art. 15 right of access |
| HCP self-service: consent management | `planned` | consent table ready |

---

## Stage 8 — Training & Onboarding

| Feature | Status | Notes |
|---|---|---|
| Training module (courses) | `planned` | training_course + training_lesson + training_progress |
| Animated UI tours | `planned` | lesson.type=animation_tour; step config in content_config JSONB |
| Quiz assessments | `planned` | lesson.type=quiz; scored, pass/fail per lesson |
| Required course enforcement | `planned` | training_course.is_required; feature gating until completion |
| Offline-first PWA | `planned` | Service Worker + IndexedDB + Background Sync + sync_queue server table |

---

## Compliance & Infrastructure (ongoing)

| Feature | Status | Notes |
|---|---|---|
| GDPR consent flow (PL/EU) | `planned` | consent table ready |
| LFPDPPP consent flow (MX) | `planned` | same table, jurisdiction='MX' |
| PDPA consent flow (TH) | `planned` | same table, jurisdiction='TH' |
| EFPIA annual disclosure report | `planned` | encounter.transfer_of_value + event_attendee.cost_allocated |
| Sample audit trail (EFPIA) | `planned` | sample_transaction ledger + signature_url |
| SaaS billing (Stripe) | `planned` | platform.invoice + platform.payment_method; replaces "manual for MVP" |
| Supabase → Hetzner VPS migration | `deferred` | post-MVP, when cost justifies |
| Two Supabase projects (platform / client) | `deferred` | Option B; viable at 5+ paying clients |
| Per-client DB isolation | `deferred` | Option C; only if contractually required |

---

## Social Media & Marketing Automation

| Feature | Status | Notes |
|---|---|---|
| Social links (WhatsApp, LINE, LinkedIn, Instagram, Telegram) | `planned` | identities.social_links JSONB; LINE is primary channel in TH |
| WhatsApp automation (outreach sequences) | `planned` | automation_rule table stub ready |
| Social listening (HCP/patient mentions) | `deferred` | needs external API + AI pipeline |
| Campaign module | `deferred` | too speculative for now |

---

## Deferred / Not started

| Feature | Reason |
|---|---|
| Admin panel (super-admin) | After Stage 1-3 done |
| Email templates engine | Hardcoded templates work fine for MVP |
| Multi-language HCP/patient portal | After portals themselves are built |
| Patient app (native mobile) | Separate product decision needed; PWA covers MVP |

---

_Last updated: 2026-05-24_
_To add a feature: add a row, assign stage, update status as work progresses._
