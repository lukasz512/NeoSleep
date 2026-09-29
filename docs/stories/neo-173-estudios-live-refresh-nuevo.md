## Refined User Story: Estudios live refresh + "Nuevo" marker (NEO-173)

**Classification**: feature
**Raw input**: "estudios jak sie zapisuja z QR to chcialbym zeby sie odswiezal ich stan w zakladce estudios jak jest otwarta. nowe wyniki badan powinny byc oznaczone na profilu pacjenta. potem dojda powiadomienia (moze juz powinnismy sie zajac tym tematem tez?)"
**Scoping answers**: decision form https://claude.ai/artifact/GJSCLGajRxraYjUUA77eSg (2026-09-28)

### As a doctor / admin / manager, I want the open Estudios tab to pick up what the patient just filled on their phone, and to see which results I haven't opened yet, so that I never miss a new questionnaire, consent or study result.

### Stakeholder Notes
- 👤 User: today the doctor has to reload the page after the patient hands the phone back; nothing says which results are new since their last look.
- 🏢 Client: fewer missed results = faster treatment decisions; "who opened which result" is auditable.
- 🩺 Patient: indirect but real — an unnoticed STOP-Bang/PSG result delays treatment. The marker is per user, so one colleague opening it does not hide it from the treating doctor.
- 🚀 NeoCRM/Platform: generic (checklist-driven, any tenant); the "opened" trail is the base the later notifications (NEO-134 engine) can build on.
- ⚖️ Compliance: opening a result is a health-data read → audited (audit_log `read`, entity_type `ChecklistEntry`). Background polling must NOT write a health-data read every 15 s → it asks a hash-only version endpoint and loads (and audits) the checklist only when something changed.

### Medical-Industry Trend Check
- EHR result inboxes reduce overload by routing and de-duplicating, and clinicians act on fewer alerts the more they receive (49 → 27 alerts/100 orders raised action from 12% → 33%) — quiet in-row marker first, interrupting notifications later. — https://optimumhit.com/insights/blog/ehr-optimization/managing-alert-fatigue-an-alarming-problem/ , https://omnimd.com/blog/clinical-inbox-ehr-management/

### Decisions (form answers)
- A1 refresh: QR dialog open → the existing fast check (NEO-117/123: every 2 s after a 5 s delay; the form said 5 s — kept the faster existing one); Estudios tab open → every 15 s, link or not ("otwarta strona z badaniami – co 15 s"; the first cut wrongly made it 60 s without a live link — fixed 2026-09-29); side panel / Details card → every 60 s. Only while the page is visible; immediate check on return to the app.
- A2 also refresh the Overview studies card. A3 new rows get a short highlight (no toast).
- B1 new = added by someone other than me (patient via QR, other staff). B2 per user (explained to Łukasz; he asked what it meant). B3 marker clears when I open that result. B4 chip on the row only. B5 clinical roles only (admin, doctor, manager — the tab's existing guard).
- C notifications: later. Recipients (QR creator + treating doctor + admins + all clinical), bell in the top bar for every role, in-app only — recorded in FEATURE_BACKLOG.md.

### Acceptance Criteria
- [ ] Patient saves a QR step while the doctor has Estudios open (no QR dialog) → the row updates within 15 s, highlighted, without a spinner or error state flashing.
- [ ] Estudios tab checks every 15 s even with no link made in it (emailed / other device); hidden tab → no requests; coming back → one immediate check.
- [ ] A background check that finds nothing new writes no audit_log row and does not refetch the checklist.
- [ ] A result added by someone else after rollout shows "Nuevo"; my own additions never do.
- [ ] Opening it (view / open file / sleep study) removes the chip for me only, and leaves an audit_log `read` row (`ChecklistEntry`, entry id).
- [ ] Results created before rollout are never "Nuevo".
- [ ] Rep (no study role) gets 403 on the version and opened endpoints.

### Open Questions
- none (notifications scoped for later)

### Hand-off
→ `/dev feat estudios-live-refresh-nuevo`
