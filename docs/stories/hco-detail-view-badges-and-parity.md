## Refined User Story: HCO Detail View — Type/Status Badges, Contact Hover Tooltips, Specialties Parity

**Classification**: trivial — pure FE view/form/i18n polish on an entity view that already exists; no new backend route, migration, or schema change.

**Raw input**: NEO-6 ("widok HCO"), the remaining scope after 6 nightly-worker passes and one already-merged story (`docs/stories/hcp-hco-territory-redesign.md`) shipped most of the ticket (territory rollout, Notes/Related Doctors/History tabs, embedded Google Map). What's left, verbatim from the ticket: "poza tym na view chcialbym zeby bylo jakies rozroznienie pomiedzy klinika, prywatna placowka… moze byc po prostu labelka, ten element moze wypasc z grida typu label → value. tylko moze byc wieksza, align to right… na samej gorze widoku. estado tez… taka label."; "telephone, mail, and adress … should have icons, when hovered they reveal what they hold"; "wydaje mi sie tez ze formularz view i edit pokazuja inne wartosci… jeski sa schowane rzeczy - chce je zobaczyc"; and "speciality powinno byc na gorze, where the region is" (edit form field order).

### As a rep/manager/admin, I want the HCO detail view to visually distinguish clinic type and status at a glance, let me see the actual contact details on hover, and see every field the edit form already lets me set, so that browsing a clinic record doesn't require opening the edit form just to see hidden data.

### Stakeholder Notes
- User (rep/manager): Type and Status now render as colored pill badges at the top of the view, right of the clinic name — no longer buried in the label→value grid. Specialties (already savable via the edit form) are now visible on the view. Contact icons (phone/email/website/Google Maps link) reveal the underlying value on hover instead of only exposing it via `aria-label`.
- Client/Tenant: No new data captured — this only surfaces fields the form already writes. No tenant-config change needed.
- Patient: No impact — HCO-only change.
- NeoCRM/Platform: Reused existing helpers rather than duplicating — `hcoStatusColor()` (`utils/hcoLabels.ts`) already existed for the status chip; added a matching `hcoTypeColor()` alongside it. Specialty label resolution reuses the exact pattern `HCPDetailView.vue`'s `specialtyLabel()` already established (`configStore.specialtyItems`). Badge markup follows `PatientDetailView.vue`'s existing `VChip` pattern for status.
- Compliance: No new field exposure — `specialties` was already writable via the edit form and returned by `GET /api/v1/organization/:id`; this only adds it to the view template. No auth/consent/audit_log code touched.

### Acceptance Criteria
- [x] Type and Status appear as `VChip` badges in the view's title row, right-aligned opposite the avatar/name, colored via `hcoTypeColor()`/`hcoStatusColor()` — removed from the label→value grid.
- [x] Phone/email/website/Google Maps-link icons show the actual value in a hover tooltip (`VTooltip`, same activator pattern already used for the header action buttons in this file).
- [x] `specialties` displayed in the view (resolved via `configStore.specialtyItems`, same lookup as HCP's specialty), closing the view/edit parity gap the ticket raised.
- [x] Edit form: `specialties` field moved to sit immediately after `type` (was near the bottom, after `google_link`) — the ticket's literal "speciality powinno byc na gorze, where the region is" ask. Verified against `hcoForm.spec.ts:50-55`'s cols:6-field-order assertion, which is unaffected (`specialties` is `cols:12`).
- [x] New i18n key `user.hco.detail.specialties` added to `en.json` first, then real PL/MX translations (not English placeholders).

### Open Questions (still deferred — not answered here, same as every prior worker pass)
- [ ] Territory rename — cosmetic (already done: the "Region" row's label already reads "Territory") vs. a functional switch of the HCO form away from the free-text `region` field entirely. Left as two parallel fields (`region` + `territory_id`), same as Patient's existing pattern — no decision made either way.
- [ ] Electronic documents tab ("na pewno tez beda dokuemnty elektroniczne, to samo co u pacjenta") — patient does not actually have a documents tab today, so there's no existing pattern to mirror. This is its own storage/permission-model feature, `/arch`-level — needs a separate ticket, not guessed at here.
- [ ] "Modern, medical-grade, award-winning dashboard" — substantially addressed already by the merged territory/tabs redesign (avatar, tabs, embedded map, Notes panel) plus this pass's badges; no further concrete, testable ask remains unaddressed in the ticket text.

### Hand-off
-> None required — scope is FE-only and self-contained. Visual QA in a browser (desktop + mobile width) recommended before merge, same as the predecessor story.
