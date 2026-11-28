## Refined User Story: NeoSleep AI stage 1 (knowledge-only assistant for admin)

**Classification**: feature
**Raw input**: Connect Claude, for Alfred (CEO) only for now. Answers concise, accurate questions about the platform, to educate doctors, reps, users and patients. Must be secure. Later: doctors, patients, automations, voice dictation into the PCF.

### As an admin (CEO), I want to ask the platform questions in plain language and get short, accurate answers so that I can educate doctors, reps, users and patients without digging through docs.

### Stakeholder Notes
- User: Admin only in stage 1. Today answers come from asking Łukasz or reading the user guide.
- Client: Fewer support questions; reusable per tenant later.
- Patient: No downstream effect in stage 1 (no patient data reaches the model; knowledge is docs only).
- NeoCRM/Platform: Provider-independent AI layer (provider, knowledge, tools) reused by doctor/patient/voice channels.
- Compliance: Stage 1 sends no personal data. Stage 2 (live patient data to an external model) needs a DPA/GDPR review first.

### Medical-Industry Trend Check
- n/a — internal tooling.

### Acceptance Criteria
- [ ] POST /api/v1/ai/chat returns 403 for any non-admin role and 401 without a token (real DB test).
- [ ] ANTHROPIC_API_KEY is read only in apps/api; never in a frontend bundle.
- [ ] Every call writes an audit_log row (user, question length, model, token counts, outcome); the question text is not stored.
- [ ] Per-user rate limit and a max question length (rejected with 400/429).
- [ ] The answer is capped in length; the system prompt demands max 3 sentences, answer in the question's language.
- [ ] Knowledge is a curated docs bundle built at build time; no runtime repo access.
- [ ] When the provider key is missing the endpoint returns 503, not a crash.
- [ ] Admin chat UI strings are in en/pl/mx.

### Open Questions
- none (stage 2 live-data tools is a separate ticket)

### Hand-off
→ `/dev feat neosleep-ai-stage-1`
