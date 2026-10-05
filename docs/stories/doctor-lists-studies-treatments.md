## Refined User Story: the doctor's Estudios and Tratamientos lists follow the care protocol

**Classification**: feature
**Raw input** (Łukasz, 2026-10-05, translated from Polish): "Propose a better list layout. I want new Estudios and Tratamientos: these are views for the doctor. What matters to them there?" Decided in the decision form `doctor-lists-r1` (https://claude.ai/artifact/QSoaynSDmG3nUwi3g4Qn5D).

### As a doctor (partner dentist) opening Estudios or Tratamientos, I want to see first what is waiting on me, where each patient stands in the protocol and when their next visit is, so that I act on the right patient without opening each record.

### Stakeholder Notes
- 👤 User: before this, the list showed the doctor themself in every row ("Médico"), always "Aparato dental" (Tipo) and a status ("Iniciado") that says neither which visit nor what is next.
- 🏢 Client: Dra. Lorena's protocol (docs/clinical/protocolo-atencion) has 5 visits plus follow-ups at 2 weeks and 1/3/6 months. The list now speaks that language.
- 🩺 Patient: overdue controls and unreturned sensors surface on their own instead of being found by chance.
- 🚀 NeoCRM/Platform: the queue chips are generic `AppEntityList` infrastructure (`queues` prop); the stages come from one SQL module (`apps/api/src/db/clinicalQueues.ts`).
- ⚖️ Compliance: no new data leaves the API: the same scope (CORE-104: a doctor sees only their own patients) and the same health-data read audit. Vendor names stay off the screen (`i18n-partner-names.spec.ts`): the home study is "Estudio domiciliario", the lab is "laboratorio".

### Decisions (doctor-lists-r1)
- D1: chips "Requieren acción / En curso / (Seguimiento) / Finalizados", opening on "Requieren acción" when it has rows, else "En curso".
- D2: stage = the 5 protocol visits plus a follow-up phase (2 weeks, 1/3/6 months, then periodic).
- D3: AHI and severity shown; until the pulmonologist interprets, the number is marked "Pendiente de neumólogo" and carries no severity.
- D4: the advance level only, recorded by the doctor at a control visit (`metadata.advance_level`); no snore-monitor data.
- D5: built straight away, without waiting for Dra. Lorena.

### How stages are derived (no visit type exists yet, so from dates)
- Plan = the device order. Draft → Cita 2 (scan, order not sent). Sent, not received → Cita 3 (delivery, due 15 days after the order). Received → Cita 4 (control due 14 days after delivery). One visit since the delivery day → Cita 5. Two or more → follow-up (next of 1/3/6 months, then every 6). Cancelled, or patient discharged → done.
- A visit counts when it is not cancelled or no-show, already happened, and took place on a day after the delivery.
- "Needs action": order to send or to check (failed), or no visit booked while the next one is due within 14 days (overdue when its date has passed).
- Study: hand over the sensor → recording → sensor not returned (after 5 days) → waiting for results → results to interpret → candidate: book the scan / not a candidate / treatment started; a study taken after a plan is the final control → review for discharge → discharged.

### Acceptance Criteria
- [x] Tratamientos for a doctor: Paciente · Etapa (5-segment bar + visit name) · Próxima cita · Aparato (order state + level) · IAH (first → latest, % change). No Médico or Tipo columns; staff keep them.
- [x] Estudios for a doctor: Paciente · Estudio (initial / final check, date) · Resultado (D3) · Siguiente paso (+ how long it has waited). Staff keep "Interpretado por".
- [x] Queue chips with counts for doctor and admin; the count of "Requieren acción" is highlighted when non-zero; an empty chip is not an empty list.
- [x] In a chip, rows sort by priority: action first, overdue first, then the nearest visit or due date.
- [x] The doctor or admin sets the advance level (1–10) on a received order in the patient's device panel; it is saved on its own endpoint and audited, and the rest of metadata is kept.
- [x] Phone cards: the name keeps the full width; the stage bar, the stage and the next visit or step stack under it.
- [x] No vendor names in the UI copy.

### Test Coverage Map
| Criterion | Test |
|---|---|
| Stage, due date, action flag, queue, counts, priority (plans) | `apps/api/src/queries/clinicalQueues.spec.ts` › treatment plan progress |
| Next step, phase, queue, counts (studies) | `clinicalQueues.spec.ts` › sleep study progress |
| Advance level: set, clear, keep metadata, audit, reject bad values, updated_at untouched | `clinicalQueues.spec.ts` › SetTreatmentAdvanceLevelCommand |
| Chips: default chip, `?queue=`, remembered chip, empty chip ≠ empty list | `apps/pwa/src/composables/useEntityList.queues.spec.ts` |
| Columns and chips by role | `apps/pwa/src/components/clinicalLists/clinicalLists.spec.ts` › doctor's list columns |
| D3 pending vs severity, attention colour, AHI trend | `clinicalLists.spec.ts`, `apps/pwa/src/utils/clinicalProgress.spec.ts` |
| Advance level field saves once, ignores out-of-range | `apps/pwa/src/components/patient/AdvanceLevelField.spec.ts` |
| No vendor names | `apps/pwa/src/plugins/i18n-partner-names.spec.ts` (existing) |

### Open / follow-ups
- Stages are inferred from dates until visits carry a kind (post-demo "one visit model"); once they do, the stage should read the visit kind instead.
- The lab's own status (synced every 15 minutes, CORE-67) is a raw vendor string and is not shown; "Pedido / Recibido" comes from our own fields. A neutral mapping (e.g. "En fabricación") needs the vendor's status list.
- Delivery date falls back to `updated_at` for a plan marked completed without `appliance_delivered_at`.
