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

## Extension (Łukasz, 2026-09-26): every form in the app
"All forms in the app must behave this way." Same PR:
- **API:** `ValidationError` reads the field from its own message (`first_name is required` → `first_name`, `Invalid email format` → `email`) and also sends a `reason` (`required` / `invalid`), so all ~350 existing validations name their field without editing each one. Explicit field only where the message doesn't lead with the key.
- **App:** one composable (`useFormErrors`) and one box (`FormErrorSummary` in `@ui`) are used by FormRenderer and every hand-written form: event, appointment, OrthoApnea order wizard (per step), partner registration, login / forgot / reset / change password.
- **Login:** "wrong email or password" moves from a toast into the form's summary box (reverses the earlier decision to show it as a toast).
- A field without its own server message falls back to "This field is required" or "Check this field", depending on `reason`.

## Not changed
- Note and comment boxes (one textarea, Add disabled while empty): nothing a server can reject per field.
- The patient's QR questionnaire: the pending inline-alert PR already moved its validation into the form.
