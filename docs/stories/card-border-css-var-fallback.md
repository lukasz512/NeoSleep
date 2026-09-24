# Card border collapses to 0 when Vuetify border variables are missing

**Type:** trivial fix (no Linear ticket) · **Date:** 2026-09-24

## Report

On desktop, the detail card (e.g. above "Szpital Kliniczny" on an HCO detail view)
showed `border-width: 0` in DevTools, on all desktop views.

## Mechanism

15 declarations in `apps/pwa/src` built their border as:

```css
border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
```

If either variable is unresolved at the element, the whole `border` shorthand becomes
*invalid at computed-value time* and every longhand falls back to its initial value —
`0px none`. The width is lost, not only the color. Verified in headless Chrome with the
variables set to `initial`:

| Rule | Variables present | Variables missing |
|---|---|---|
| before | `1px solid rgba(0,0,0,0.12)` | `0px none` |
| after  | `1px solid rgba(0,0,0,0.12)` | `1px solid rgba(0,0,0,0.12)` |

## Fix

Every such declaration now carries `var()` fallbacks matching Vuetify's light-theme
defaults: `rgba(var(--v-border-color, 0, 0, 0), var(--v-border-opacity, 0.12))`. With
the variables present (the normal case) the rendered result is identical.

## Open

The exact condition under which the variables go missing was **not reproduced**:
pwa-dev (light and dark, sidebar expanded and collapsed) and two local dev servers all
computed `1px solid` in headless Chrome at 1440px. Still to check: Safari, and the exact
URL/branch the report came from. If the border is still 0 after this change, the cause
is a different rule, not these variables.
