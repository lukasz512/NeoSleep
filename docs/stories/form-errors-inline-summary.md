# NEO-109 — Form errors in the form, not in toasts

**Ticket:** NEO-109 · **Decided:** Łukasz, 2026-09-26 — variant B of three ([options](https://claude.ai/artifact/1T2UmzAgrNKnQAs1pC9bc2))

## Story
As anyone filling in a form (rep, doctor, manager, admin), when something I typed can't be saved,
I want the form itself to show me which field is wrong and why,
so I can fix it without guessing from a generic "Error al guardar" toast.

## Decisions
- **Variant B** (the GOV.UK / NHS error-summary pattern): the message sits under the field, a red box at the top of the form lists every error (each line jumps to its field), and each section heading shows an error count.
- Errors appear only after the first Save. An empty form does not open all red.
- The API names the field it rejects (`400 { error, code: "VALIDATION_ERROR", field }`). The PWA marks that field and shows no toast. A rejected field's error clears as soon as the field is edited.
- Toasts stay for what no field can fix: no connection, server errors, a rejection naming a field the form doesn't show, and success.
- A neighbouring control keeps its height when a field's message appears under it (the sex toggle beside the birth date).
- Birth date range: 1900-01-01 → today. The API already enforced this; the patient form now also checks it before Save.
- Built once in FormRenderer, so every config-driven form gets it.

## Angles (enrich-user-story)
- **User:** a long folder form no longer hides an error below the fold. The summary is the entry point.
- **Tenant / white-label:** all copy is in i18n (EN/PL/MX); no tenant-specific logic.
- **Patient:** a wrong birth date (year 0001) can no longer be retried blindly. The user sees exactly what to fix.
- **Platform:** a generic `ValidationError(message, field?)` in the API and one `field` in the api-client's error info. Other entities can adopt this by passing `field`.
- **Compliance / accessibility:** the summary is `role="alert"` (screen readers announce it). Links are real buttons with a focus outline. The section count has an aria-label.

## Out of scope / follow-ups
- Only the patient commands name their fields so far. Other entities (HCP, HCO, lead) still fall back to the toast until their `ValidationError`s pass `field`.
- Hand-written (non-FormRenderer) forms, such as the OrthoApnea wizard, are unchanged.
