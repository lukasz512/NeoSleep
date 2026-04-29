# Website Component Catalogue (`apps/website/`)

Reference for all reusable components in the website app. Load this when designing or reviewing a website view.

> The website uses custom SCSS — NOT Vuetify. Components are in `apps/website/src/components/`.

---

## Layout Components

### `DefaultLayout.vue`
Wraps every page. Contains `DefaultHeader`, `<RouterView>` (in `<main>`), `DefaultFooter`.

### `DefaultHeader.vue`
- Desktop: horizontal nav with `NavTooltip` on items, `ThemeToggle`, `LanguageSelect`
- Mobile: hamburger → `MobileNavTheme` overlay
- Scrolled state: apply glass effect (see `liquid-glass.md` Pattern 3)
- No props — driven by i18n keys

### `DefaultFooter.vue`
Standard footer. Contains logo, nav columns, social links, legal note.

---

## Hero / Banner Components

### `TealBanner`
**The primary hero/CTA block.** Used on most views.

```vue
<TealBanner
  eyebrow-key="i18n.key"
  line1-key="i18n.key"
  line2-key="i18n.key"
  subtitle-key="i18n.key"
  image-src="/images/hero.jpg"        <!-- optional background image -->
  image-position="right 57%"          <!-- CSS background-position -->
  variant="cta"                       <!-- "cta" = compact, no image slot -->
>
  <template #ctas>
    <!-- RouterLink or <a> buttons go here -->
  </template>
</TealBanner>
```

- `variant="cta"` strips the image and reduces padding — use for bottom-of-page CTAs
- Always provides 2 CTAs: primary (white outline) + secondary (ghost border)
- Background: dark teal gradient + radial light blobs

### `HomeHero.vue`
Homepage-specific hero. Full-screen with animated text and stats. Not reusable for other pages — use `TealBanner` instead.

---

## Content Components

### `HomeSplitSection`
Left/right split: text on one side, visual on the other. Config-driven via `websiteContent.ts`.

```ts
// apps/website/src/config/websiteContent.ts
splitSections: [
  {
    id: 'section-id',
    imageKey: '/images/split.jpg',
    eyebrowKey: 'website.home.split1.eyebrow',
    headingKey:  'website.home.split1.heading',
    bodyKey:     'website.home.split1.body',
    ctaKey:      'website.home.split1.cta',
    ctaTo:       '/contact',
    imageRight:  true, // false = image on left
  }
]
```

### `HomeStats.vue`
Animated counters (uses `useCountUp`). Hard-coded stat values — update in the component when real data is available.

### `HomeSolutions.vue`
3-column card grid showing the three platform pillars (pharma, patient, HCP). Icons from `icons/`.

### `HomeCtaBanner.vue`
Bottom-of-page CTA. Simplified version of `TealBanner` without the image slot.

### `TestimonialsCarousel.vue`
Auto-rotating testimonial cards. Content is i18n-driven. Used on `ForPatientsView` and `HomeView`.

### `TealBanner` (reused as CTA)
Compact CTA block — see above, `variant="cta"`.

---

## Utility Components

### `ThemeToggle.vue`
Light/dark mode toggle button. Reads/writes `[data-theme]` on `<html>`. Always include in the header.

### `LanguageSelect.vue`
Language switcher. Triggers i18n locale change and persists to localStorage.

### `NavTooltip.vue`
Tooltip that appears on hover over nav items. Wraps any element.

### `LogoIcon.vue`
NeoSleep logo SVG. Props: `size`, `variant` (`light`|`dark`|`auto`). Always use this, never hardcode the logo SVG inline.

---

## Icon Components (`components/icons/`)

All icons are line-style SVGs (stroke, not fill). Use via import:

```vue
<IconHeart class="my-icon" />
<IconShield />
<IconClock />
<IconSmile />
<IconGraduation />
<IconMoon />        <!-- sleep/night — use on patient-facing content -->
<IconPeople />
<IconHeartbeat />   <!-- medical/health — use on clinical content -->
<IconChart />
<IconBox />
```

**Icon sizing pattern:**
```scss
.icon-container {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--website-icon-bg);
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 22px;
    height: 22px;
    color: var(--website-icon-stroke);
  }
}
```

---

## Mobile Navigation Components

### `MobileNavTheme.vue`
Full-screen overlay nav for mobile. Activated by hamburger in header. Contains `MobileNavLink` items.

### `MobileNavLink.vue`
Single nav item within the mobile overlay.

### `MobileNavLanguage.vue`
Language selector within the mobile nav overlay.

### `MobileBottomNav.vue`
Sticky bottom tab bar for mobile. Used on views where bottom navigation makes sense.

---

## CSS Design Tokens

All tokens defined in the website's SCSS globals:

```
--website-primary          → teal brand color
--website-bg               → page background (changes light/dark)
--website-text             → primary text
--website-text-secondary   → muted text
--website-border           → card/input border
--website-card-radius      → border-radius for cards
--website-shadow-sm        → small card shadow
--website-shadow-md        → hover / elevated card shadow
--website-icon-bg          → icon container background
--website-icon-stroke      → icon color
--website-footer-card-border → dashed border for partner/empty cards

--neosleep-very-dark-teal  → darkest teal (hero backgrounds)
--neosleep-darker-teal     → dark teal
--neosleep-light-teal      → light teal accent (on dark backgrounds)
```

---

## Standard Section Anatomy

Every page section follows this structure:

```html
<section
  ref="sectionRef"
  class="home-section page-container home-reveal"
  :class="{ 'home-reveal--visible': sectionVisible }"
>
  <p class="home-eyebrow">{{ t('section.eyebrow') }}</p>
  <h2 class="home-heading">{{ t('section.heading') }}</h2>
  <p class="home-sub home-sub--center">{{ t('section.subtitle') }}</p>

  <!-- content grid / cards -->
</section>
```

Standard CSS classes:
- `home-section` — vertical padding rhythm (4rem top/bottom)
- `page-container` — max-width + horizontal padding
- `home-eyebrow` — small caps label above heading
- `home-heading` — h2 size with tight tracking
- `home-sub` — subtitle below heading, muted color
- `home-sub--center` — centered variant
- `home-reveal` + `home-reveal--visible` — scroll animation

---

## Views and Their Purpose

| View | Route | Primary audience | Primary CTA |
|------|--------|-----------------|-------------|
| `HomeView` | `/` | Both | → Contact / Find Specialist |
| `ForPatientsView` | `/for-patients` | Patients | → Find Specialist |
| `FindSpecialistView` | `/find-specialist` | Patients | → Contact (`?type=patient`) |
| `ForProfessionalsView` | `/for-professionals` | HCPs | → Contact (`?type=professional`) |
| `ContactView` | `/contact` | Both | Form submit |
| `AboutView` | `/about` | B2B | → Contact |
| `HelpView` | `/help` | Patients | → Contact |
| `CareersView` | `/careers` | Candidates | → Job apply |
| `PrivacyView` | `/privacy` | Legal | — |
