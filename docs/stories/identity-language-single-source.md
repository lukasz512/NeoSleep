## Refined User Story: Language is a visible, editable attribute of the identity

**Classification**: feature (touches schema defaults, every mail and notification send site, three detail screens)
**Raw input**: Language settings must be visible; which language mail goes out in must be obvious to the user. `identities` owns the language and nothing else. Country and language must be visible and editable on user, patient and doctor. A doctor who is also a user inherits from `identities`, so a change in one place changes both. Different regions share one database for now. Same for notifications.

### As an admin, I want each person's country and language shown and editable on their screen so that I know, without guessing, in which language every mail and notification to them goes out.

### Stakeholder Notes
- User: admin/FFM sees "Country" and "Language" on user, HCP and patient detail and can change them. A rep never needs to think about it.
- Client: a tenant operating in PL and MX gets correct language per recipient with no per-send configuration; the territory is only a default at creation.
- Patient: no clinical effect, but consent and questionnaire mails in the wrong language are a comprehension risk, so correctness matters.
- NeoCRM/Platform: generalizes to TH and any later country: add a locale file and one mapping row.
- Compliance: language and country are personal data on the identity; no new data category. No early flags.

### Medical-Industry Trend Check
n/a: internal change.

### Current state (audited 2026-11-26)
- `identities.language` (NOT NULL DEFAULT 'en') and `identities.region` exist; no screen shows or edits language; only HCPDetailView carries `language` in its form model.
- Mail resolves through `emailLocale` = `patientEmailLocale(language, region)` (explicit pl/es/mx language wins, else region, else en).
- Notifications resolve through `getIdentityLanguage` + `emailT(language, ...)` and ignore region, so a PL-region account with language 'en' gets English notifications but Polish mail. This is the inconsistency to remove.
- `insertStaffUser` creates identities without region or language.
- Region-to-locale mapping exists three times (`localeForRegion`, `inferLanguage`, `jurisdictionLocale`) besides `patientEmailLocale`.
- Send sites using the resolver: mailer, lead, practitioner, invitePractitioner, partnerDocuments, partnerSignatories, appointmentPatient, historiaClinicaEmail, questionnaireRequest, booking route. Notification producers: notify.ts (appointment, orthoapneaSync, deviceOrders, push), problemReportNotifications.

### Decided by default (a test proves each)
- `identities.language` is the only input to mail and notification language. Region is read only when a language is first set. (resolver spec: language 'pl' + region MX returns pl)
- One function `localeForCountry(region)` is the single region-to-locale mapping and is used only to default `language`. The other three helpers are deleted. (grep-style spec: one definition)
- A language with no templates falls back to English at render time, never at storage time; the screen shows the stored value plus a "mails sent in English" hint. (emailT spec)
- Staff creation sets region and language from the assigned territory; invites inherit from the lead, practitioner or patient record. (insertStaffUser spec)
- A doctor who is also a user is one identity row: PATCH on either screen updates the same columns. (integration spec: edit on HCP, read on user)
- Notifications use the same resolver as mail. (notify spec: PL account, language 'en' stored, still can't diverge because language is always set)
- Backfill migration: rows whose language is the default 'en' and whose region is PL or MX get the mapped language, so existing accounts such as Alfred's change visibly and are listed in the migration comment.

### Acceptance Criteria
- [ ] User, HCP and patient detail show Country and Language; admin and manager can edit both; reps see them read-only.
- [ ] Editing language on an HCP that is also a user is reflected on the user screen and in the next mail.
- [ ] Creating a staff account with a Mexico territory stores region MX and language mx.
- [ ] Every send site and `notify()` obtain the language from one function reading `identities.language`.
- [ ] PL account gets Polish mail and Polish notification; MX gets Spanish for both; a language without templates gets English.
- [ ] The three duplicate region-to-locale helpers are gone.
- [ ] The user form shows one Country + Language pair; the Territory field (data scope) only suggests them when changed and never overwrites an explicit choice. Seen on the MX manager's form: Territory México, Región empty.
- [ ] Backfill also covers accounts with an MX or PL territory and an empty region.
- [ ] A listing in the admin screen (or the PR) shows which identities changed in the backfill.

### Decisions (Łukasz, 2026-11-26, round identity-language-r1)
- D1 replaced by a simpler rule: the territory is the only source of the initial value. Choosing a territory on user creation fills region and language (a watcher on the field); both can then be edited by hand. The duplicate Territory + Region pair on the create-user form collapses to one field. No affiliation-based or send-time computation.
- D2: store the chosen language; mail goes out in English with a visible label when no templates exist.
- D3: admin and manager edit region and language of everyone; a doctor edits them for their own patients; each person may change their own language.
- Out of scope here: patient self-edit and deletion request (no patient login exists yet, see the deferred patient portal); tracked separately.

### Superseded open questions (kept for history)
- [ ] D1 Doctor with several affiliations: language comes from the identity (set once at creation from the first affiliation's country) and never changes on its own afterwards. Recommended; the alternative recomputes from affiliations on every send, which brings back the implicit behaviour this ticket removes.
- [ ] D2 English fallback for a country with no templates: keep English as the stored default, shown as "English (fallback)". Alternative: block saving a language that has no templates.
- [ ] D3 Edit rights: admin and manager only. Alternative: also the person themself on their own profile.

### Hand-off
→ `/arch assess identity-language` for the migration and resolver placement; then `/dev feat identity-language`. Needs CORE-259 (PR pending) merged first, since it introduces `emailLocale(recipient)`.
