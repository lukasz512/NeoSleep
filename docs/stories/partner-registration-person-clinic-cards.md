## Refined User Story: Partner registration — person and clinic as separate cards

**Classification**: feature — changes which data a doctor can edit while signing the partner agreement, including the login email.
**Raw input**: "when he signs the agreement as a doctor he wants to edit more data: my email and phone number; the person and the clinic should be better separated, that distinction is missing here" (Łukasz, NEO-270, MX).

### As a doctor signing the partner agreement, I want to see and correct my own details (name, email, phone, licence) apart from my clinic's details so that the contract and my account carry the right person and the right clinic.

### Decisions (Łukasz, decision-form `partner-person-r1`)
1. **Login email is editable** (D1: yes). The doctor may change it on the registration page; it becomes the login, the agreement email and the signed-documents recipient. Uniqueness among non-patients still applies (`EMAIL_IN_USE`, 409, field `email`).
2. **First and last name are editable** (D2: more). Any change is written to the audit log.
3. **Personal phone is not printed in the contract PDF** (D3: no). It is stored only in `identities.phone`.

### Settled by tests (not asked)
- Two cards: "Tus datos" (first name, last name, login email, personal phone, cédula) and "Datos de la clínica" (role, clinic name, clinic email, clinic phone, RFC, billing address). The cédula moves to the person card.
- Personal phone is required, prefilled from `identities.phone`, editable.
- Changing any detail after signing forces a re-sign (existing `detailsChangedResign`).

### API
`POST /invite/accept` accepts `firstName`, `lastName`, `email`, `phone`; it returns `{ success: true, email }` with the email actually saved, so the "go to login" link uses it. `GET /invite/validate` returns `phone`.

### Stakeholder Notes
- 👤 User: the doctor stops being stuck with whatever the invite carried.
- 🏢 Client: the contract names the correct person and clinic.
- 🩺 Patient: no effect.
- 🚀 NeoCRM/Platform: one more identity-changing write on a public token-gated route; guarded by the email uniqueness rule and audited.
- ⚖️ Compliance: name and email changes are audit-logged; the personal phone stays out of the contract.
