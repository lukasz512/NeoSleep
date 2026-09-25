## Refined User Story: Record-context toasts (NEO-76)

**Classification**: feature. The change is small in behaviour, but it alters how every status message in the PWA looks, and it adds a new Retry interaction.
**Raw input**: "pwa notyfikacje nadal mi sie nie podobaja - zaproponuj 4 rozwiazania - medical, dopasowane do aplikacji, zawsze z ikona" → picked D "Kontekst rekordu", with the icon tile grey instead of teal → "cala ta zmiana i wszystkie akcje sprawdzone na widokach [...] jesli jest ponow [...] byloby cudownie".
**Approved design**: https://claude.ai/artifact/Baf8wJMCibHqpdw1xnanRh (v2)

### As a field user (rep, KAM, manager, doctor), I want each toast to show what it is about and, when something fails, to let me retry in place, so that I don't have to guess which record was affected or redo the whole action by hand.

### Stakeholder Notes
- 👤 User: toasts appear after saves, deletes and loads on patient, HCP, HCO, lead, planner and document screens. Today a failure only says "Nie udało się…", and the user has to find the button again. Retry in the toast saves that round-trip. This matters most on a flaky mobile connection in the field.
- 🏢 Client: the tenant gets a calmer, more clinical-looking UI that matches the NEO-57 identity language (square tiles, badges). Nothing is tenant-specific: the colours come from theme tokens.
- 🩺 Patient: no downstream clinical effect. Retry only re-runs the same user-initiated request. It never runs automatically.
- 🚀 NeoCRM/Platform: this is a generic component with a white-label-safe API (`icon`, `context`, `action`). The icons come from the shared AppIcon set.
- ⚖️ Compliance: the context line may show a patient or HCP name. Rules:
  - Show only the record name that is already visible on the same screen, never health data such as a diagnosis or AHI.
  - The toast is transient and never persisted.
  - This is not a push or OS notification, so there is no lock-screen exposure.

### Medical-Industry Trend Check
- n/a (internal UI component change).

### Acceptance Criteria
- [ ] Every toast shows an icon on a neutral grey tile, with a coloured status badge (success/info/warning/error), in both the light and the dark theme.
- [ ] `show(message, type)` keeps working unchanged. A call without `icon` gets a generic icon per type.
- [ ] Every existing call site passes an entity icon that fits its domain (note, patient, practitioner, clinic, document, order/device, study, plan, territory, user, planner, lead).
- [ ] Where the view has the record loaded, the toast shows a context line with the record's display name.
- [ ] Error toasts whose failed operation is a single re-invocable function (save, delete, load) show a "Retry" button. Clicking it dismisses the toast and re-runs that operation, and if the retry succeeds the success toast follows.
- [ ] The reload countdown toast has a "Now" button that reloads at once. The chunk-load failure toast has a "Reload" button.
- [ ] A toast with an action stays for 12 s. The other toasts auto-dismiss after 8 s, as today. The countdown toast lasts until its countdown ends.
- [ ] `role="alert"` is used for error and warning, `role="status"` otherwise (NEO-10). The toast renders above dialogs. On mobile, swiping it down dismisses it. The action button is keyboard-focusable.
- [ ] New i18n keys exist in en, pl and mx.
- [ ] Unit tests cover the `show()` options, the action invocation and the default icons.

### Open Questions
- none. The design was approved by Łukasz via the artifact above.

### Hand-off
→ `/dev feat record-context-toasts` (scope is clear and frontend-only)
