<!-- The neoCRM product page (CORE-215), a second page of this site at /corporativo/neocrm/. It sells the
     CRM to small companies, mainly in Spain, and only says what the product does today (claims.ts).
     A personal link can greet the company (?para=), set its sector (?sector=) and say who is reading
     (?rol=): the role reorders the sections in the DOM itself, so keyboard and screen-reader order
     match what is on screen. Hero first and the demo request last, always. -->
<template>
  <div class="ncrm">
    <a class="skip" href="#contenido">{{ t("nav.skip") }}</a>
    <header class="top">
      <a class="top__mark" href="#inicio">neo<span>CRM</span></a>
      <div class="top__nav">
        <a class="top__link" :href="switchLocalePath(other, query, false)" :lang="other" :hreflang="other">{{ t("nav.language") }}</a>
        <button type="button" class="top__theme" :aria-label="theme === 'dark' ? t('nav.themeToLight') : t('nav.themeToDark')" :aria-pressed="theme === 'dark'" @click="toggleTheme">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18V3z" fill="currentColor" /><circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
        </button>
        <a class="btn btn--small" href="#demo">{{ t("nav.demo") }}</a>
      </div>
    </header>

    <main id="contenido">
      <section id="inicio" class="hero">
        <p v-if="prospect" class="hero__greeting">{{ t("hero.greeting", { name: prospect.name }) }}</p>
        <p class="hero__eyebrow">{{ t("hero.eyebrow") }}</p>
        <h1 class="hero__title">{{ t(`hero.titles.${lens.sector ?? "default"}`) }}</h1>
        <p class="hero__body">{{ t("hero.body") }}</p>
        <p class="hero__actions">
          <a class="btn" href="#demo">{{ t("hero.cta") }}</a>
          <a class="btn btn--quiet" href="#security">{{ t("hero.secondary") }}</a>
        </p>

        <div class="lens" role="group" aria-labelledby="lens-label">
          <p id="lens-label" class="lens__label">{{ t("lens.label") }}</p>
          <div class="lens__options">
            <button
              v-for="option in ROLE_OPTIONS"
              :key="option"
              type="button"
              class="lens__option"
              :data-role="option"
              :aria-pressed="(lens.role ?? 'all') === option"
              @click="setRole(option === 'all' ? null : option)"
            >
              {{ t(`lens.roles.${option}`) }}
            </button>
          </div>
          <p class="lens__note" aria-live="polite">{{ t(`lens.notes.${lens.role ?? "all"}`) }}</p>
        </div>
      </section>

      <section v-for="(id, i) in order" :id="id" :key="id" class="sec" :class="`sec--${id}`" :aria-labelledby="`${id}-title`">
        <header class="sec__head">
          <span class="sec__num" aria-hidden="true">{{ String(i + 1).padStart(2, "0") }}</span>
          <h2 :id="`${id}-title`" class="sec__title">{{ t(`sections.${id}.title`) }}</h2>
          <p class="sec__lead">{{ t(`sections.${id}.lead`) }}</p>
        </header>
        <ul class="sec__items">
          <li v-for="key in itemKeys(id)" :key="key" class="item">
            <h3 class="item__title">{{ t(`${key}.title`) }}</h3>
            <p class="item__body">{{ t(`${key}.body`) }}</p>
          </li>
        </ul>
      </section>

      <section id="demo" class="demo" aria-labelledby="demo-title">
        <h2 id="demo-title" class="demo__title">{{ prospect ? t("contact.titleFor", { name: prospect.name }) : t("contact.title") }}</h2>
        <p class="demo__body">{{ t("contact.body") }}</p>
        <p class="demo__actions">
          <a class="btn btn--invert" :href="mailLink">{{ t("contact.email") }}</a>
          <a class="btn btn--outline" :href="whatsappLink(message)" target="_blank" rel="noopener">{{ t("contact.whatsapp") }}</a>
        </p>
      </section>
    </main>

    <footer class="foot">
      <p>{{ t("footer.note") }}</p>
      <a :href="homeLink">{{ t("footer.back") }}</a>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import es from "./locales/es.json";
import { ROLES, SECTORS, lensFrom, lensQuery, sectionOrder, type Role, type SectionId } from "./lens";
import { CONTACT, whatsappLink } from "../content/contact";
import { switchLocalePath, type Locale } from "../lib/locale";
import { prospectFrom } from "../lib/prospect";
import { applyTheme, storeTheme, type Theme } from "../lib/theme";

const props = defineProps<{ locale: Locale; search: string }>();
const { t } = useI18n();

const ROLE_OPTIONS = ["all", ...ROLES] as const;
const other: Locale = props.locale === "es" ? "en" : "es";
// the main site, one folder up, in the same language
const homeLink = `../${props.locale === "en" ? "?lang=en" : ""}`;

const query = ref(props.search);
const lens = reactive(lensFrom(props.search));
const prospect = prospectFrom(props.search);
const order = computed(() => sectionOrder(lens.role));

function setRole(role: Role | null) {
  lens.role = role;
  query.value = lensQuery(query.value, lens);
  // the address follows the switch, so the page can be shared as it is being read
  window.history.replaceState(null, "", `${window.location.pathname}${query.value}${window.location.hash}`);
}

/** i18n keys of a section's items; "who it is for" lists the reader's own sector first. */
function itemKeys(id: SectionId): string[] {
  if (id === "who") {
    const sectors = lens.sector ? [lens.sector, ...SECTORS.filter((s) => s !== lens.sector)] : SECTORS;
    return sectors.map((s) => `sections.who.items.${s}`);
  }
  return es.sections[id].items.map((_, i) => `sections.${id}.items.${i}`);
}

const message = computed(() => (prospect ? t("contact.messageFor", { name: prospect.name }) : t("contact.message")));
const mailLink = computed(() => {
  const subject = prospect ? t("contact.subjectFor", { name: prospect.name }) : t("contact.subject");
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message.value)}`;
});

const theme = ref<Theme>(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  applyTheme(theme.value);
  storeTheme(theme.value);
}
</script>

<style scoped>
.ncrm {
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 var(--ncrm-gutter);
}
.skip {
  position: absolute;
  left: -999px;
  top: 8px;
  padding: 12px 16px;
  background: var(--ncrm-surface);
  color: var(--ncrm-ink);
  border-radius: 8px;
  z-index: 10;
}
.skip:focus {
  left: 16px;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;
}
.top__mark {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ncrm-ink);
  text-decoration: none;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.top__mark span {
  color: var(--ncrm-primary);
}
.top__nav {
  display: flex;
  align-items: center;
  gap: 8px;
}
.top__link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 12px;
  color: var(--ncrm-ink);
  font-weight: 500;
}
.top__theme {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--ncrm-ink);
  cursor: pointer;
}
.top__theme svg {
  width: 22px;
  height: 22px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 24px;
  border-radius: 999px;
  border: 2px solid var(--ncrm-primary);
  background: var(--ncrm-primary);
  color: var(--ncrm-on-primary);
  font-weight: 600;
  text-decoration: none;
  transition: background-color 0.15s ease;
}
.btn:hover {
  background: var(--ncrm-primary-hover);
  border-color: var(--ncrm-primary-hover);
}
.btn--small {
  min-height: 44px;
  padding: 0 16px;
  white-space: nowrap;
}
/* narrow phones: the hero's own demo button is right below */
@media (max-width: 480px) {
  .top .btn--small {
    display: none;
  }
}
.btn--quiet {
  background: none;
  color: var(--ncrm-primary);
}
.btn--quiet:hover {
  background: var(--ncrm-tint);
  border-color: var(--ncrm-primary);
}
.btn--invert {
  background: var(--ncrm-on-band);
  border-color: var(--ncrm-on-band);
  color: var(--ncrm-band);
}
.btn--invert:hover {
  background: var(--ncrm-on-band);
  border-color: var(--ncrm-on-band);
  opacity: 0.9;
}
.btn--outline {
  background: none;
  border-color: var(--ncrm-on-band);
  color: var(--ncrm-on-band);
}
.btn--outline:hover {
  background: none;
  border-color: var(--ncrm-on-band);
  opacity: 0.85;
}

.hero {
  padding: clamp(40px, 9vw, 104px) 0 clamp(32px, 6vw, 64px);
}
.hero__greeting {
  margin: 0 0 16px;
  font-size: clamp(20px, 3vw, 28px);
  font-weight: 600;
  color: var(--ncrm-primary);
}
.hero__eyebrow {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ncrm-muted);
}
.hero__title {
  margin: 0;
  max-width: 18ch;
  font-size: clamp(36px, 7vw, 72px);
  line-height: 1.04;
  letter-spacing: -0.03em;
  font-weight: 700;
  text-wrap: balance;
}
.hero__body {
  margin: 24px 0 0;
  max-width: 60ch;
  font-size: clamp(17px, 2vw, 20px);
  color: var(--ncrm-muted);
}
.hero__actions,
.demo__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 32px 0 0;
}

.lens {
  margin-top: clamp(40px, 6vw, 64px);
  padding: 20px;
  border: 1px solid var(--ncrm-line);
  border-radius: 16px;
  background: var(--ncrm-surface);
}
.lens__label {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ncrm-muted);
}
.lens__options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.lens__option {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--ncrm-line);
  border-radius: 999px;
  background: none;
  color: var(--ncrm-ink);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.lens__option:hover {
  border-color: var(--ncrm-primary);
}
.lens__option[aria-pressed="true"] {
  background: var(--ncrm-primary);
  border-color: var(--ncrm-primary);
  color: var(--ncrm-on-primary);
}
.lens__note {
  margin: 12px 0 0;
  font-size: 14px;
  color: var(--ncrm-muted);
}

.sec {
  display: grid;
  gap: 24px;
  padding: clamp(40px, 7vw, 80px) 0;
  border-top: 1px solid var(--ncrm-line);
  scroll-margin-top: 16px;
}
.sec__num {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ncrm-primary);
}
.sec__title {
  margin: 0;
  font-size: clamp(26px, 4vw, 40px);
  line-height: 1.1;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
.sec__lead {
  margin: 12px 0 0;
  max-width: 44ch;
  color: var(--ncrm-muted);
}
.sec__items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.item {
  padding: 20px;
  border: 1px solid var(--ncrm-line);
  border-radius: 12px;
  background: var(--ncrm-surface);
}
.item__title {
  margin: 0;
  font-size: 17px;
  line-height: 1.3;
}
.item__body {
  margin: 8px 0 0;
  font-size: 15px;
  color: var(--ncrm-muted);
}
/* work in progress reads as unfinished: dashed, no fill */
.sec--roadmap .item {
  border-style: dashed;
  background: none;
}
.sec--faq .sec__items {
  grid-template-columns: 1fr;
}
@media (min-width: 900px) {
  .sec {
    grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
    gap: 48px;
  }
  .sec__head {
    position: sticky;
    top: 24px;
    align-self: start;
  }
}

.demo {
  margin: clamp(24px, 5vw, 56px) 0;
  padding: clamp(32px, 6vw, 72px);
  border-radius: 24px;
  background: var(--ncrm-band);
  color: var(--ncrm-on-band);
  scroll-margin-top: 16px;
}
.demo__title {
  margin: 0;
  font-size: clamp(28px, 5vw, 48px);
  line-height: 1.08;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
.demo :focus-visible {
  outline-color: var(--ncrm-on-band);
}
.demo__body {
  margin: 16px 0 0;
  max-width: 52ch;
  opacity: 0.9;
}

.foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 24px;
  padding: 24px 0 40px;
  font-size: 14px;
  color: var(--ncrm-muted);
}
.foot p {
  margin: 0;
}
.foot a {
  color: inherit;
}
</style>
