# Design & UI — NeoCRM Visual Language

> Referenced from `apps/pwa/src/assets/theme.scss`. This is the source of truth for design
> tokens and the direction we're rolling them out toward. Update whenever a token changes or
> a new surface adopts the system described here.

## Reference / north star

Direction confirmed 2026-07-19 against a monochrome, tonal-layered dashboard style (shadcn
community theme "Luma" — neutral SaaS/fintech aesthetic, not Google's Material 3 Expressive,
which is colorful and playful). What we're taking from it:

- **Depth via tone, not shadow** — elevation communicated by a lighter/darker surface tint
  (nested cards sit on a visibly different gray), shadow is a supporting detail, not the
  primary depth cue.
- **Big, soft shape language** — generous corner radii on cards, pill/stadium shape on
  chips and primary actions.
- **Color is reserved** — grayscale carries structure and hierarchy; color appears only on
  interactive elements and status. **Decision: keep the existing teal primary** as the sole UI
  accent — do not move to a black/near-black primary as in the reference screenshot. Fits
  white-label: a neutral shell lets each tenant's brand color read clearly instead of
  competing with UI chrome.
- **Hierarchy via weight**, not just color or size — key numbers (KPIs, targets) get heavy
  font weight as the primary signal.
- **Motion stays restrained** — this look pairs with fast, snappy transitions, not bouncy
  ones. `spatial` here means layered tone, not playful physics.

This direction validates — rather than replaces — work already piloted on
`AppEntityList.vue` / `AppEntityList.css` (see below). The "refactor" tracked in
`FEATURE_BACKLOG.md` → Design System is mostly about extending that existing system to the
rest of the app, not inventing a new one.

## Motion & transition inspiration

Sites worth revisiting when we get to page transitions, scroll animation, and micro-interactions
(mainly relevant to `apps/web`, but the easing/restraint philosophy applies to `apps/pwa` too —
see "Motion stays restrained" above). Not yet scoped to a stage — parking here until we pick it up.

- [Shopify Editions Winter 2026](https://www.shopify.com/editions/winter2026#retail)
- [patrickheng.com](https://patrickheng.com)

## Core principles

1. **Depth via tone, not shadow.** Prefer `surface-container-*` role differences over
   `box-shadow` stacking. Shadows (`--pwa-shadow-sm` / `--pwa-shadow-md`) stay subtle,
   supporting cues only.
2. **Fibonacci shape & spacing scale** for anything that should read as "expressive"
   (feed cards, spatial groupings) — see token table below. Flat controls (inputs, buttons)
   keep the smaller `--pwa-radius` scale.
3. **Color is reserved for interactive/status elements.** Teal (`--pwa-primary`) is the one
   UI accent. Status chips use tonal color (existing `.pwa-lead-status-chip*` pattern in
   `theme.scss`) — already aligned with this direction, no change needed there.
4. **Weight-based hierarchy** for key metrics — bold numeric display, not color, is the
   primary signal for dashboard/KPI values (relevant to Stage 4 FFM dashboard work).
5. **Motion stays snappy, not bouncy.** `--pwa-ease-out-smooth` is the default for all
   navigation/state transitions. `--pwa-ease-spring` is reserved for rare, deliberate feedback
   moments (e.g. a save-success confirmation) — not general-purpose motion.

## Existing tokens (`theme.scss`)

| Token | Value | Use |
|---|---|---|
| `--pwa-fib-xs` … `--pwa-fib-3xl` | 5 / 8 / 13 / 21 / 34 / 55 / 89px | Fibonacci spacing/shape scale — expressive surfaces (feed cards) |
| `--pwa-radius` | 10px | Flat controls: inputs, buttons |
| `--pwa-modal-radius` | 16px | Dialogs/modals |
| `--pwa-radius-sm` | 2px | Small elements (loader bars) |
| `--pwa-shadow-sm` / `--pwa-shadow-md` | soft, low-alpha black | Supporting elevation only — never the primary depth cue |
| `--pwa-ease-out-smooth` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default transition easing |
| `--pwa-ease-spring` | `cubic-bezier(0.34, 1.2, 0.64, 1)` | Reserved for rare feedback moments, not general motion |
| `--pwa-primary` / `--pwa-primary-hover` | brand teal | The one color accent — do not introduce a second competing accent |

## M3 color roles (`packages/vuetify/src/index.ts`)

Values reuse the grays already in `--pwa-border` / `--pwa-bg-secondary` under M3-standard
semantic names, so existing surfaces don't shift — only the vocabulary becomes reusable for
new components.

| Role | Light | Dark |
|---|---|---|
| `outline` | `#79747E` | `#948F94` |
| `outline-variant` | `#e0e0e0` | `#333333` |
| `surface-container-low` | `#f7f7f7` | `#1a1a1a` |
| `surface-container` | `#f2f2f2` | `#1e1e1e` |
| `surface-container-high` | `#ececec` | `#262626` |

## State-layer pattern

Hover/press feedback is a separate tonal overlay composited on top of the base surface —
not a `background-color` swap, which would replace the tone instead of tinting it:

```css
.card--clickable {
  position: relative;
}
.card--clickable::after {
  content: "";
  position: absolute;
  inset: 0;
  background-color: rgb(var(--v-theme-on-surface));
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.card--clickable:hover::after { opacity: 0.04; }
.card--clickable:active::after { opacity: 0.08; }
```

## Rollout status

- **Piloted**: `AppEntityList.vue` / `.css` mobile feed cards — Fibonacci shape/spacing,
  `outline` / `outline-variant` / `surface-container-*` roles, `::after` state-layer hover/press.
  Card sizing uses two consecutive Fibonacci numbers deliberately (89px tile / 55px avatar ≈
  golden ratio).
- **Done**: buttons, inputs, dialogs, desktop data table (`theme.scss`):
  - Buttons: labeled (non-icon) `.v-btn` moved to pill/stadium shape (`--pwa-radius-pill`,
    9999px) — decision confirmed, matches the Fibonacci-scale card rounding. Icon-only buttons
    stay circular (Vuetify's own `.v-btn--icon` default, already correct for M3).
  - Inputs: outlined `.v-field` border now uses `outline-variant` at rest / `outline` when
    focused, replacing Vuetify's default `currentColor`-at-opacity border — same static gray
    as the card borders instead of an on-surface tint. **Bugfix**: the rest-state border was
    initially near-invisible — Vuetify's own `--v-field-border-opacity` (0.38, meant to dim an
    on-surface `currentColor`) was still applying on top of the already-light `outline-variant`
    gray, double-dimming it. Forced to full opacity at rest since the color itself is already
    the subtle element; hover/error still layer their own opacity bump on top unchanged.
  - Dialogs: `.pwa-form-dialog__card` and the new shared `.pwa-confirm-dialog__card` (nested
    discard/confirm dialogs, previously a bare `elevation="8"` VCard) both use
    `surface-container-high` tone + `--pwa-shadow-md` as a supporting cue only.
  - Desktop data table: `.app-entity-list__table-wrap` border moved from generic
    `--v-border-color` to `outline-variant`; header row (`.v-data-table__th`) now sits on
    `surface-container-low` as a distinct tonal layer instead of Vuetify's own header
    background.
  - Button padding: labeled `.v-btn` horizontal padding bumped (`padding-inline: 24px` default/
    large, `16px` small) — the pill shape's rounded ends were eating into Vuetify's original
    rectangular-button padding, cramping labels like "Cancel" / "Add patient" against the curve.
- **Done**: `apps/web` (`website-theme.scss`) — same role vocabulary aliased onto existing
  tokens rather than touched file-by-file: `--website-outline` / `--website-outline-variant` /
  `--website-surface-container-*` added (light + dark), and `--website-border` (used at ~40
  call sites across HomeHero, CareersJobCard, EventoView, FindSpecialistView, ...) now aliases
  `--website-outline-variant` so the whole site picks up the M3 tone from one token change.
  Buttons (`.home-btn`, `--brand-radius-btn: 9999px`) were already pill-shaped before this
  rollout started — no change needed there. `surface-container-*` tokens are defined and
  available but not yet retrofitted onto shadow-elevated cards (bigger per-view redesign,
  deferred — see open items).
- **Done**: left nav drawer (`packages/ui/AppShell.vue`, `apps/pwa/AppNavLinks.vue`) — a
  short-lived custom glassmorphism treatment (backdrop-filter blur, animated glow, spring
  easing) was tried and reverted per direct feedback ("no custom stuff"). Settled on plain
  Vuetify-native theming instead: the drawer's `color="surface-container-low"` prop replaces
  what used to be hand-rolled `--pwa-sidebar-bg` CSS vars, and nav items switched from manual
  `RouterLink`+`isActive` bookkeeping to `VListItem :to` + `VList color="primary"`, which gives
  Vuetify's own tonal active-state background/text for free — the "one teal accent" rule
  applied via the framework instead of custom rgba/color-mix. Desktop and mobile also collapsed
  from two different drawer components into one `VNavigationDrawer` (`:temporary="mobile"` +
  `:rail="!mobile && railCollapsed"`), Vuetify's own responsive composition — `apps/web`'s
  separate hand-rolled `MobileNavDrawer` (swipeable) is intentionally untouched, since
  `apps/web` doesn't use Vuetify anywhere else and one drawer isn't worth pulling it in for.
- Tracked in `FEATURE_BACKLOG.md` → Design System → "Material 3 rollout (full app)".

## Open items for the next pass

- Uppercase "kicker" label utility (small, letter-spaced, `--pwa-text-secondary`) for section
  metadata — not yet defined as a reusable class.
- Numeric-display type scale for KPI values (Stage 4 FFM dashboard, rep target tracking) —
  not yet defined.
- `apps/web`: `--website-surface-container-*` tokens exist but aren't yet used — retrofitting
  shadow-elevated cards (job cards, feature panels, testimonials) to tonal depth is a larger,
  per-view design pass, not a token-only change like the border rollout.
- `AppDataTable.vue` appears unreferenced anywhere in the app (superseded by
  `AppEntityList.vue`) — candidate for removal in a separate cleanup pass, left untouched here.

_Last updated: 2026-07-20_
