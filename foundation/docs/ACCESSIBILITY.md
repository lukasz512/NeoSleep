# Accessibility (NeoSleep)

## Skip to main content

Rep-app (and other app shells that use the same pattern) provide a **skip link** so keyboard and screen reader users can jump straight to the main content without tabbing through the full sidebar and header.

- **Where**: First focusable element on the page (first Tab). Visually hidden until focused.
- **Label**: Uses i18n key `layout.skipToMain` (e.g. "Skip to main content" / "Przejdź do treści").
- **Behavior**:
  - **Click or Enter**: Prevents default navigation, scrolls the main content into view (`scrollIntoView({ behavior: 'smooth', block: 'start' })`), then moves focus to `<main id="main-content">`.
  - **Target**: The main content area has `id="main-content"`, `role="main"`, and `tabindex="-1"` so it can receive focus when the skip link is activated.
- **Tests**: `apps/rep-app/src/layouts/AppLayout.spec.ts` asserts skip link presence, main landmark, keyboard support (Enter), and that `focusMainContent` scrolls and focuses.

If the skip link “doesn’t work”, check:

1. The element with `id="main-content"` exists (AppLayout and DefaultLayout both define it).
2. No other script or style removes focus or overrides scroll (e.g. layout `overflow`).
3. The skip link is still the first focusable element in the DOM (no new focusable element inserted before it).

## Keyboard (TAB and focus)

- **Focus ring**: Global `:focus-visible` in `theme.scss` shows a 2px outline in the primary color so keyboard users always see where focus is. Mouse clicks do not show the ring (`:focus` is transparent).
- **Tab order**: Follows DOM order. Sidebar nav, header user menu, and content links are all reachable by Tab. No positive `tabindex` unless required for a specific widget.
- **Skip link**: First in tab order; activating it moves focus to main content.

## Screen readers

- **Landmarks**: `<main id="main-content">`, sidebar with `aria-label="App navigation"`, header with page title in `<h1>`, dialogs with `role="dialog"` and `aria-modal="true"`.
- **Live regions**: Notifications use `role="status"` and `aria-live="polite"` on the message so new toasts are announced.
- **Language**: `document.documentElement.lang` is set from the user’s locale (en/pl/es) so the correct language is announced.
- **Loader**: Loading overlay has `role="status"` and `aria-label` from `layout.loader.label`.

## Touch targets

See **Styling (STYLING.md)**: mobile/tablet interactive controls have minimum 44×44 px touch targets; layout tests assert this where applicable.
