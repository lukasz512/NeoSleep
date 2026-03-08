# NeoSleep marketing website – frontend brief for Stich

**Purpose:** Brief for building/refining the public marketing website for **NeoSleep** (Neo Sleep) – sleep apnea solutions. The site addresses **two audiences** (patients and dentists) with a clear **general → split** structure, plus **contact** and **chatbot**. Stack: **Vue 3, TypeScript, Vite, SCSS, Vuetify 3**; design must use the **NeoSleep brand palette** below.

---

## 1. Site structure (information architecture)

The site must make the split between audiences obvious and easy to navigate.

### 1.1 General / shared section

- **Home (landing):** Single entry point. Hero, value proposition, then **clear fork**: “For patients” and “For dentists” (two paths).
- **About:** Company mission, team, story – shared.
- **Shared header/footer:** Logo, main nav, CTAs, footer links. Nav should expose: **Solutions** (or “What we offer”), **For Dentists**, **For Patients**, **About**, **Contact**. Optional: **Get started** CTA in header.

### 1.2 For patients

- Dedicated area (sub-section or sub-site feel): **For Patients**.
- Content: what NeoSleep offers to patients (sleep apnea solutions, comfort, quality of life), how it works, benefits, FAQ, testimonials if any.
- Clear CTA: e.g. “Find a specialist" or “Get started” leading to contact or partner finder.
- This path should feel patient-oriented (benefits, reassurance, next steps).

### 1.3 For dentists

- Dedicated area: **For Dentists** (or “For professionals”).
- Content: value for practices (tools, workflow, patient outcomes), how to partner, training, FAQ.
- CTA: e.g. “Contact us” / “Become a partner”.
- This path should feel B2B/professional.

### 1.4 Contact module

- **Contact page** (or section): form (name, email, subject, message), optional phone, and display of contact details (email, address if needed).
- Form: validation (e.g. required fields, email format), success/error states, optional “We’ll reply within X” message.
- Submit can go to BFF/API or external service (e.g. form backend); frontend only needs a clear contract (POST body, success/error handling). No backend implementation required in this brief unless agreed separately.

### 1.5 Chatbot

- **Chatbot** for quick questions (21st-century expectation).
- Behaviour: floating widget (e.g. bottom-right), open/close, message list, input, send. Optional: simple canned replies or link to FAQ/Contact.
- Tech: can be a third-party embed (e.g. Tawk, Crisp, custom widget) or a small Vue component that talks to an API; specify which in implementation. Frontend: ensure it fits the layout (doesn’t cover key CTAs on mobile), uses brand colors, and has min 44×44 px touch target for the toggle (accessibility).

---

## 2. Brand identity and colors

Use the following palette everywhere (buttons, links, sections, footer, chatbot).

### 2.1 Primary palette (from NeoSleep brandbook)

| Token / variable recommended   | Hex       | Usage |
|--------------------------------|-----------|--------|
| **Primary teal (main accent)**  | `#128F83` | Primary buttons, key CTAs, logo accent, links. |
| **Light teal / mint**          | `#8ED6CE` | Backgrounds, subtle highlights, hover states. |
| **Darker teal**                | `#10544E` | Hover for primary, darker accents. |
| **Very dark teal**             | `#082A27` | Footer background, dark sections. |
| **Charcoal dark**              | `#474747` | Dark backgrounds (e.g. header/footer on light pages), part of logo. |
| **Charcoal medium (text)**     | `#555555` | Body text on white. |
| **White**                      | `#FFFFFF` | Backgrounds, text on dark. |

### 2.2 CSS/SCSS variables (for our stack)

Define in a global theme file (e.g. `website-theme.scss` or `theme.scss`) so the rest of the app uses variables, not raw hex:

```scss
:root {
  --color-primary-teal: #128F83;
  --color-primary-teal-hover: #10544E;
  --color-light-teal: #8ED6CE;
  --color-darker-teal: #10544E;
  --color-very-dark-teal: #082A27;
  --color-charcoal-dark: #474747;
  --color-charcoal-medium: #555555;
  --color-white: #FFFFFF;

  /* Map to existing names if the project already has --website-primary etc. */
  --website-primary: #128F83;
  --website-primary-hover: #10544E;
  --website-secondary: #128F83;
  --website-secondary-hover: #10544E;
  --website-bg: #ffffff;
  --website-text: #555555;
  --website-text-secondary: #616161;
  --website-footer-bg: #082A27;   /* or #474747 */
  --website-radius: 8px;
  --website-font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --website-btn-min-height: 44px;
  --website-btn-min-width: 44px;
}
```

Logo: the NeoSleep “O” is a two-arc circle (top arc = teal `#128F83`, bottom = charcoal `#474747` or white on dark). On teal background, top arc can match background, bottom white. Prefer SVG with CSS variables for fill so it adapts to light/dark/teal backgrounds.

---

## 3. Tech stack and conventions (our ecosystem)

- **Vue 3** (Composition API preferred), **TypeScript**, **Vite**.
- **Vuetify 3** as the base UI library: use `v-btn`, `v-card`, `v-text-field`, `v-form`, etc. Style via props and theme, minimal custom CSS.
- **SCSS only** (no plain CSS): all styles in `.scss` and `<style lang="scss">`. Shared tokens in one theme file (e.g. `website-theme.scss`).
- **i18n:** All user-facing strings in locale files (e.g. `en.json`, `pl.json`) under keys like `website.*` so we can add languages and later drive from CMS.
- **Routing:** Vue Router. Suggested structure: `/` (home), `/for-patients`, `/for-dentists`, `/about`, `/contact`. Home can still use anchors (`#solutions`, `#for-dentists`, `#for-patients`, `#cta`) for the landing.
- **Accessibility:** Skip-to-main link, focus visible (e.g. 2px outline in primary), landmarks (`main`, nav), min **44×44 px** touch targets on mobile for buttons and chatbot toggle. Document `lang` from locale.
- **Tests:** Add or extend specs for layout (e.g. header, nav, section ids, touch targets) so future changes don’t break structure.

---

## 4. Deliverables (summary)

1. **Information architecture:** One general section (home, about) and two clear paths: **For Patients**, **For Dentists** (each with its own content and CTAs).
2. **Contact module:** Dedicated contact page/section with form and validation; integration contract for submit (API or provider TBD).
3. **Chatbot:** Floating widget, on-brand, non-intrusive; 44×44 px toggle on mobile.
4. **Design:** Full use of NeoSleep palette (teals, charcoal, white) via SCSS variables; logo variants for light/dark/teal backgrounds.
5. **Code:** Vue 3 + TS + Vite + Vuetify 3 + SCSS; i18n for all copy; routing and structure as above; a11y and tests as per project rules.

---

## 5. References in this repo

- [WEBSITE_MODULE.md](WEBSITE_MODULE.md) – current website app and layout.
- [BRAND_AND_APP_CONFIG.md](BRAND_AND_APP_CONFIG.md) – brand assets and app theme (website can later use `GET /api/config/app`).
- [STYLING.md](STYLING.md) – SCSS-only, Vuetify props, touch targets, modal/layout patterns.
- [ACCESSIBILITY.md](ACCESSIBILITY.md) – skip link, focus, landmarks, touch targets.


## 6. Novelty
- rememeber this website will be very fluid and will have a lot of animtions - liquid glass flows, so it looks super modern and nowatorska. also 3d implementations.
---

*Document version: 1.0. For Stich – frontend implementation of NeoSleep marketing website.*
