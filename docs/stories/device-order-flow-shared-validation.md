## Refined User Story: device order flow on shared OA rules

**Classification**: feature
**Tickets**: NEO-210 (live OA tests), NEO-213 (wizard fixes), CORE-95 (shared rules, provider adapter, OA replica)
**Raw input** (Łukasz, 2026-10-03, translated from Polish): "By the end of the day we need to test our connection with OA and placing orders… we must prepare the whole order flow, tracking comes later. Validations are very important, so that we apply the same ones on our frontend and can report form errors properly instead of relying only on OA's API… one day we'll get a normal API, so the view must be separated from these temporary workarounds… I want it always well tested, but tests never connect to OA, only to a replica stored in the project." Follow-ups, the same day:
- The sequence type is a one-choice switch.
- On the ruler the incisor tips sit at 0.
- Always ship to the HCO linked to the ordering HCP.
- Morning Aligner is a flag, as in OA.
- Patients in OA get as much data as we have.

### As a doctor (or manager), I want to order a NOA device from the patient record with errors shown immediately in the form, so that what reaches OrthoApnea is always a valid, manufacturable order

### Stakeholder Notes
- 👤 **User:** the same rules as OA's own portal, shown inline per step. No surprise rejection after sending. The delivery address is the doctor's own clinic, so there is nothing to retype.
- 🏢 **Client (NeoSleep):** every order is real and billed (OA has no sandbox). The 2026-10-03 live shots showed OA's server accepts geometrically invalid orders (order 454013, a 3 mm range), so our validation is the only guard.
- 🩺 **Patient:** a wrong MR/MP/SP produces a wrong device. These rules protect the patient directly.
- 🚀 **NeoCRM/Platform:** the canonical order model and rules live in `@neo/device-order` (CORE). The OA adapter is one provider, so a future real OA API is a second adapter with no view change (ADR-028).
- ⚖️ **Compliance:** personal data sent to OA is limited to what OA's form asks for. Every order is audited with the exact DTO, the rules version and the acting user. Reps cannot place orders (NEO-199 gate).

### Medical-Industry Trend Check
- n/a. This is partner-integration correctness. The rule sources are OA's own portal, harvested in `docs/partners/orthoapnea-order-rules.md`.

### Acceptance Criteria
- [ ] One validator (`validateDeviceOrder`) runs per step in the PWA and again in the API before any OA call. The same table of cases passes in both.
- [ ] An invalid order or an incomplete HCO address returns 400 with field issues, and nothing is sent to OA.
- [ ] Orders reach OA in OA's own format: multipart `treatmentDTO`, with patient link, clinic, product and HCO delivery address. The adapter output equals the DTO OA accepted live (order 454012).
- [ ] Two concurrent submits for one plan create exactly one OA order. The second caller gets 409 with its own message and no Retry.
- [ ] Tests never reach apneadock; they run against the OA replica built from recorded fixtures.
- [ ] Step 2: Estándar | Individualizada is a one-choice switch. Estándar shows SP, −1, 1, 2 read-only. Individualizada shows mm/%, SP and 3 values, plus up to 3 additional splints.
- [ ] Ruler: the incisor tips sit on 0 by default.
- [ ] Step 1: the order always ships to the ordering doctor's primary HCO. A missing HCO field blocks Next with a clear message.
- [ ] Morning Aligner is a flag on the NOA order, never a second order.

### Open Questions
- [ ] Should an advance range under 5 mm stay a warning, as in OA's form, or become a block? OA's server accepts it either way.
- [ ] Promotion code and scanner choice are not sent today (OA needs a promo-code object and a scanner enum). Add them later?
- [ ] Status tracking: reads on 454012 and 454013 start Monday 2026-10-06 (CORE-67).

### Hand-off
→ `/dev feat` — built on branch `worktree-neo-210-oa-live-test-orders`; ADR-028 records the architecture.
