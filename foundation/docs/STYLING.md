# Styling (NeoSleep)

## Lint and format
- **ESLint** (root `eslint.config.mjs`): Vue 3 recommended + **PascalCase for component tags** in templates (e.g. `<VCard>`, `<VCardTitle>` instead of `<v-card>`). Run: `npm run lint`; fix with `npm run lint -- --fix`.
- **Prettier** (root `.prettierrc`): Consistent formatting (semi, tabWidth 2, printWidth 100). Run: `npm run format`. Recommended: **Vue - Official (Volar)** and **Prettier - Code formatter** in VS Code (`.vscode/extensions.json`); enable **Format on save** and set default formatter to Prettier for a modern, tidy layout.

## Global rule: SCSS only
All styles in the project use **SCSS** (`.scss`), not plain CSS. This applies to:
- Global assets (e.g. `theme.scss`)
- Vue component `<style lang="scss">` blocks
- Any new style files in apps or packages

Shared tokens (colors, spacing, breakpoints) live in global SCSS as CSS custom properties or SCSS variables so all apps reuse the same approach.

## Vuetify as base
- Use **Vuetify components** as the default (v-btn, v-data-table, v-text-field, v-card, etc.). Customize lightly via props, theme, or scoped overrides.
- Prefer **small, readable views** and **reusable components**. Componentize where it makes sense.

## Prefer Vuetify props over custom CSS
- **Use Vuetify component props** for styling instead of writing custom CSS when possible. Examples:
  - `VAlert`: `border="start"`, `color="primary"`, `border-color="primary"`, `rounded="lg"`, `class="mb-6"` instead of custom `border-left`, `border-radius`, `margin-bottom`.
  - `VBtn`: `variant="flat"`, `color="primary"`, `rounded="lg"` instead of custom button styles.
  - Spacing: `class="mb-6"`, `class="mt-4"` (Vuetify utility classes) instead of custom margins.
- **Only add custom CSS** when Vuetify does not expose the needed option via props or theme.
- Reference: `LeadContactForm.vue` – info alert uses Vuetify props only; no custom CSS for the alert.

## Buttons and touch targets
- **Desktop**: Buttons use default or slightly larger size (e.g. min 40px) for consistency.
- **Mobile and tablet** (viewport &lt; 768px): Interactive controls (buttons, icon buttons, links used as buttons) must have **minimum 44×44 px** touch targets for easy tapping. Use CSS variables (e.g. `--rep-btn-min-height`, `--rep-btn-min-width`) or media queries. Tests must assert touch targets meet this minimum on mobile.

## Transitions and animations
- **Physics-inspired easing:** `theme.scss` defines `$rep-ease-out-smooth`, `$rep-ease-spring`, `$rep-transition-duration` (280ms). Use for consistent, minimal animations.
- **View transitions:** AppLayout wraps RouterView in `Transition` with `view-fade-lift` (fade + vertical lift). Tests in `AppLayout.spec.ts`.
- **List stagger:** RepEntityList feed uses `TransitionGroup` with `list-stagger` for mobile cards. Tests in `RepEntityList.spec.ts`.

## Rep-app
- Theme and layout variables: `apps/rep-app/src/assets/theme.scss`. Tables: Vuetify only (RepDataTable / v-data-table); no legacy rep-table styles.
- Vuetify theme aligned with `theme.scss` (repLight / repDark). All new styles in rep-app use SCSS.

## Modal dialogs (form modals)
New modals (e.g. Edit lead, Add contact) should follow this pattern:
- **Header (VCardTitle)**: `class="mx-2 mt-2 text-h6"`
- **Footer (VCardActions)**: `class="mx-2 mb-2"`
- **Border radius**: `--rep-modal-radius` (16px) via `content-class` on VDialog
- **Padding**: Header and footer get extra padding (32px) for breathing room; body 24px
- Reference implementation: `LeadContactForm.vue`; tests in `LeadContactForm.spec.ts` assert the pattern.

## Layout and sidebar (app frame)
- **Sidebar** uses theme variables (`--rep-sidebar-bg`, `--rep-sidebar-text`, `--rep-sidebar-active-bg`, etc.) from `theme.scss`. Nav items: icon + label; active = semi-transparent primary background + primary color text.
- **Logo (sidebar)**: same padding and style as nav; no pill by default.
- **Nav icons**: inline SVG with `viewBox="0 0 24 24"` and `stroke="currentColor"` so they inherit link color. Icon container has fixed pixel size (20px) so icons render consistently.
- **Active state**: `--rep-sidebar-active-bg` (e.g. rgba primary) and primary color text; no underline. Touch targets: sidebar toggle and mobile controls respect min 44×44 px on mobile (see Buttons and touch targets).
- Tests in `AppLayout.spec.ts` assert layout structure, sidebar styles, loader, and nav icons so the frame stays stable.
