# Design and UI: “App of the future” and library choices

You’ve got Vuetify across the app and a feeling something is missing – that it looks like a “default backend app” rather than a modern, polished product. This doc summarises options and recommends a path.

## TL;DR

- **Best first step:** Invest in a **design system on top of Vuetify** (typography, palette, radius, spacing, elevation). You can get a much more “future” look without changing libraries. Worth doing from the start.
- **If you still want a different library:** **PrimeVue** is the most realistic alternative (modern themes, good tables, Vue 3). Migration is doable now but non‑trivial (replace components app‑wide).
- **Maximum custom look:** **Radix Vue + Tailwind** (or similar headless + utility CSS) gives full control but means rebuilding tables, forms, and layout; biggest refactor.

## Why it looks “default”

The “backend app” feel usually comes from:

- Default Material palette and typography (Roboto, standard blue).
- Default border radius, shadows, and spacing.
- No clear visual identity (font, color system, motion).

Vuetify supports custom themes, typography, and SASS variables. You can keep the same components and get a very different look by defining your own design tokens and applying them globally.

## Option 1: Design upgrade on Vuetify (recommended first)

Stay on Vuetify and define a proper design system:

- **Typography:** One distinctive font (e.g. “DM Sans”, “Plus Jakarta Sans”, “Geist”) for UI; optional second for headings.
- **Colors:** Keep your light/dark logic but choose a palette that feels less “Material default” (e.g. a different primary, defined secondary/surface variants).
- **Shape:** Slightly larger border radius (e.g. 8–12px) for cards, buttons, inputs; consistent across the app.
- **Elevation / shadows:** Softer, more subtle shadows; avoid heavy “floating” panels.
- **Spacing:** Consistent scale (e.g. 4/8/12/16/24/32) and use it everywhere.

Implementation:

- **Brand assets and colors:** Rep-app keeps style-related assets in **`apps/rep-app/public/brand/`** (NeoSleep.pdf, logo.svg). Primary palette is defined in **`apps/rep-app/src/assets/scss/_brand-colors.scss`** and used by `theme.scss` and (when synced) by `plugins/vuetify.ts`. See **`apps/rep-app/public/brand/README.md`** for updating colors from the PDF and replacing the logo.
- Extend `theme.scss` with the new tokens (and optionally CSS custom properties for radius, shadows).
- In `plugins/vuetify.ts`, set `defaults` for components (e.g. rounded, density) and a custom theme with your palette and typography.
- Use these tokens in layout (sidebar, header, cards) so the whole app feels coherent.

**Pros:** No migration, you already have theme and touch targets; just extend.  
**Cons:** Under the hood it’s still Material‑based; to look *completely* different you’d override a lot (but still less than swapping the whole UI lib).

## Option 2: Switch to PrimeVue

- **What it is:** Vue 3 UI library with many components, modern themes (e.g. Aura, Nora), good DataTable, forms, and accessibility.
- **Migration:** Replace Vuetify usage component by component (e.g. `v-btn` → PrimeVue Button, `v-data-table` → PrimeVue DataTable, `v-text-field` → InputText, etc.). You have a finite set of views and layout components, so migration is **doable now** (early in the project) but still a noticeable chunk of work.
- **Pros:** Different default look, “premium” themes, strong table and form support.  
- **Cons:** New API to learn, dependency swap, regression risk on layout and a11y (need to re‑verify focus, touch targets, etc.).

If you choose this path: do it before you add many more screens; migrate one area at a time (e.g. layout first, then tables, then forms).

## Option 3: Headless + Tailwind (e.g. Radix Vue)

- **What it is:** Unstyled, accessible primitives (dialogs, dropdowns, etc.); you style everything with Tailwind (or your own CSS).
- **Migration:** Largest refactor: no drop‑in table or form library. You’d use TanStack Table (or similar) for data tables and build or compose form controls. Full control over “app of the future” look, but more code and design decisions on you.
- **Pros:** No default “backend” look; you define everything.  
- **Cons:** More work for tables, forms, and layout; not recommended unless you explicitly want a Tailwind‑first, max‑custom stack.

## Recommendation

1. **Start with Option 1:** Define a small set of design tokens (font, primary/surface colors, radius, shadows) and apply them in `theme.scss` and Vuetify theme. See if the app feels “future” enough. You can do this in a few hours and iterate.
2. **Re‑evaluate after MVP:** If after shipping you still want a different component library, PrimeVue is the most realistic swap; do it as a planned refactor with tests and layout specs (e.g. AppLayout, touch targets) re‑validated.

## First design pass (already in the repo)

A first step is already applied so the app feels less “default”:

- **Font:** Optional. index.html and theme.scss: add a font `<link>` in the former, set `$rep-font-sans` in the latter (e.g. `"DM Sans", system-ui, sans-serif`). By default the app uses system font; remove the link and use `system-ui, ...` to revert.
- **Tokens:** `--rep-radius` (10px), `--rep-shadow-sm`, `--rep-shadow-md` are defined in `theme.scss`. Use them on cards, modals, and custom blocks (e.g. `border-radius: var(--rep-radius); box-shadow: var(--rep-shadow-md);`).

## References

- Vuetify 3: [Theme](https://vuetifyjs.com/en/features/theme/), [SASS variables](https://vuetifyjs.com/en/features/sass-variables/).
- PrimeVue: [Themes](https://primevue.org/theming/), [Unstyled mode](https://primevue.org/unstyled/).
- Radix Vue: [radix-vue.com](https://www.radix-vue.com/).
