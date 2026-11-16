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
        <div class="hero__grid">
          <div class="hero__text">
            <p v-if="prospect" class="hero__greeting">{{ t("hero.greeting", { name: prospect.name }) }}</p>
            <p class="hero__eyebrow">{{ t("hero.eyebrow") }}</p>
            <h1 class="hero__title">{{ t(`hero.titles.${lens.sector ?? "default"}`) }}</h1>
            <p class="hero__body">{{ t("hero.body") }}</p>
            <p class="hero__actions">
              <a class="btn" href="#demo">{{ t("hero.cta") }}</a>
              <a class="btn btn--quiet" href="#security">{{ t("hero.secondary") }}</a>
            </p>
          </div>
          <!-- drawn screens are one image each (role="img"): a screen reader hears the label, not the parts -->
          <div class="shot">
            <div class="phone" role="img" :aria-label="t('visuals.hero.alt')">
              <div class="phone__screen">
                <p class="phone__head">
                  <strong>{{ t("visuals.hero.today") }}</strong>
                  <span>{{ t("visuals.hero.count") }}</span>
                </p>
                <p v-for="n in 3" :key="n" class="visit">
                  <span class="visit__time">{{ t(`visuals.hero.visits.${n - 1}.time`) }}</span>
                  <span class="visit__name">{{ t(`visuals.hero.visits.${n - 1}.name`) }}</span>
                  <span class="visit__note">{{ t(`visuals.hero.visits.${n - 1}.note`) }}</span>
                </p>
                <p class="toast is-warm">{{ t("visuals.hero.toast") }}</p>
              </div>
            </div>
            <p class="shot__note">{{ t("visuals.note") }}</p>
          </div>
        </div>

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
        <div class="sec__body">
          <div v-if="id === 'product'" class="fig">
            <div class="card" role="img" :aria-label="t('visuals.product.alt')">
              <p class="card__title">{{ t("visuals.product.title") }}</p>
              <p v-for="n in 3" :key="n" class="field">
                <span class="field__label">{{ t(`visuals.product.fields.${n - 1}.label`) }}</span>
                <span class="field__value" :class="{ 'is-warm': n === 3 }">{{ t(`visuals.product.fields.${n - 1}.value`) }}</span>
              </p>
              <span class="card__btn">{{ t("visuals.product.save") }}</span>
            </div>
          </div>
          <div v-else-if="id === 'brand'" class="fig">
            <div class="brands" role="img" :aria-label="t('visuals.brand.alt')">
              <div v-for="n in 3" :key="n" class="brand" :class="`brand--${n}`">
                <p class="brand__head" :class="{ 'is-warm': n === 3 }">
                  {{ t(`visuals.brand.names.${n - 1}`) }}
                </p>
                <span class="brand__row" />
                <span class="brand__row brand__row--short" />
                <span class="brand__btn" />
              </div>
            </div>
          </div>
          <div v-else-if="id === 'security'" class="fig">
            <div class="layers" role="img" :aria-label="t('visuals.security.alt')">
              <div class="layer">
                <span class="layer__label">{{ t("visuals.security.layers.0") }}</span>
                <div class="layer">
                  <span class="layer__label">{{ t("visuals.security.layers.1") }}</span>
                  <div class="layer">
                    <span class="layer__label">{{ t("visuals.security.layers.2") }}</span>
                    <strong class="layers__core is-warm">{{ t("visuals.security.core") }}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="id === 'access'" class="fig">
            <div class="tones" role="img" :aria-label="t('visuals.access.alt')">
              <div v-for="tone in TONES" :key="tone" class="tone" :class="`ncrm-tone-${tone}`">
                <span class="tone__name">{{ t(`visuals.access.${tone}`) }}</span>
                <strong class="tone__sample">{{ t("visuals.access.sample") }}</strong>
                <span class="tone__row">
                  <span class="tone__btn">{{ t("visuals.access.button") }}</span>
                  <span v-if="tone === 'light'" class="tone__measure is-warm">{{ t("visuals.access.measure") }}</span>
                </span>
              </div>
            </div>
          </div>
          <div v-else-if="id === 'privacy'" class="fig">
            <div class="card" role="img" :aria-label="t('visuals.privacy.alt')">
              <p class="card__title">{{ t("visuals.privacy.title") }}</p>
              <p class="consent__person">{{ t("visuals.privacy.person") }}</p>
              <p class="consent__meta">
                <span class="consent__state">
                  <svg viewBox="0 0 24 24">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  {{ t("visuals.privacy.state") }}
                </span>
                <span>{{ t("visuals.privacy.date") }}</span>
              </p>
            </div>
          </div>

          <ul class="sec__items" :class="{ path: id === 'onboarding' }">
            <li v-for="(key, n) in itemKeys(id)" :key="key" class="item">
              <span v-if="id === 'who'" class="item__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path :d="sectorIcon(n)" /></svg>
              </span>
              <span v-else-if="id === 'onboarding'" class="path__num" :class="{ 'is-warm': n === 0 }">{{ n + 1 }}</span>
              <span v-else-if="id === 'roadmap'" class="pill" :class="[`pill--${ROADMAP_STATUS[n]}`, { 'is-warm': ROADMAP_STATUS[n] === 'progress' }]">
                {{ t(`sections.roadmap.status.${ROADMAP_STATUS[n]}`) }}
              </span>
              <h3 class="item__title">{{ t(`${key}.title`) }}</h3>
              <p class="item__body">{{ t(`${key}.body`) }}</p>
            </li>
          </ul>
        </div>
      </section>

      <section id="demo" class="demo" aria-labelledby="demo-title">
        <h2 id="demo-title" class="demo__title">{{ prospect ? t("contact.titleFor", { name: prospect.name }) : t("contact.title") }}</h2>
        <p class="demo__body">{{ t("contact.body") }}</p>
        <p class="demo__actions">
          <a class="btn btn--warm is-warm" :href="mailLink">{{ t("contact.email") }}</a>
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
import { ROLES, SECTORS, lensFrom, lensQuery, sectionOrder, type Role, type SectionId, type Sector } from "./lens";
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

/** "Who it is for" lists the reader's own sector first. */
const sectors = computed<readonly Sector[]>(() => (lens.sector ? [lens.sector, ...SECTORS.filter((s) => s !== lens.sector)] : SECTORS));

/** i18n keys of a section's items. */
function itemKeys(id: SectionId): string[] {
  if (id === "who") return sectors.value.map((s) => `sections.who.items.${s}`);
  return es.sections[id].items.map((_, i) => `sections.${id}.items.${i}`);
}

/** One line icon per sector, drawn as a single 24 px path. */
const SECTOR_ICONS: Record<Sector, string> = {
  equipos: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19a6 6 0 0 1 12 0M17 11.5a2.5 2.5 0 1 0 0-5M16.5 14a5 5 0 0 1 4.5 5",
  distribucion: "M2 5h11v10H2zM13 8h4.5L21 11.5V15h-8zM6.5 19.3a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM16.5 19.3a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z",
  servicios: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4",
  clinicas: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 8v8M8 12h8",
};
const sectorIcon = (n: number) => SECTOR_ICONS[sectors.value[n] ?? "equipos"];
/** Status of each roadmap item, in the order of sections.roadmap.items. */
const ROADMAP_STATUS = ["progress", "progress", "planned", "planned"] as const;
const TONES = ["light", "dark"] as const;

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
/* the warm accent: one element per section (NeoCrmApp.spec.ts) */
.is-warm {
  background: var(--ncrm-warm);
  color: var(--ncrm-warm-ink);
}
.btn--warm,
.btn--warm:hover {
  background: var(--ncrm-warm);
  border-color: var(--ncrm-warm);
  color: var(--ncrm-warm-ink);
}
.btn--warm:hover {
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
  padding: clamp(32px, 7vw, 88px) 0 clamp(32px, 6vw, 64px);
}
.hero__grid {
  display: grid;
  gap: 40px;
  align-items: center;
}
.hero__text {
  min-width: 0;
}
@media (min-width: 900px) {
  .hero__grid {
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: 56px;
  }
}

/* the drawn phone: today's visits and the next step */
.shot {
  display: grid;
  justify-items: center;
  gap: 16px;
  padding: clamp(24px, 4vw, 40px) 20px 20px;
  border-radius: 32px;
  background: var(--ncrm-tint);
}
.shot__note {
  margin: 0;
  font-size: 13px;
  color: var(--ncrm-muted);
  text-align: center;
}
.phone {
  width: min(100%, 296px);
  padding: 10px;
  border-radius: 40px;
  background: var(--ncrm-frame);
}
.phone__screen {
  display: grid;
  gap: 10px;
  padding: 24px 14px 14px;
  border-radius: 30px;
  background: var(--ncrm-bg);
}
.phone__screen p {
  margin: 0;
}
.phone__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px 4px;
}
.phone__head strong {
  font-size: 22px;
  letter-spacing: -0.02em;
}
.phone__head span {
  font-size: 12px;
  color: var(--ncrm-muted);
}
.visit {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0 12px;
  padding: 12px;
  border: 1px solid var(--ncrm-line);
  border-radius: 16px;
  background: var(--ncrm-surface);
}
.visit__time {
  grid-row: span 2;
  align-self: center;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ncrm-primary);
}
.visit__name {
  font-size: 14px;
  font-weight: 600;
}
.visit__note {
  font-size: 12px;
  color: var(--ncrm-muted);
}
.toast {
  padding: 12px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
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
  font-size: clamp(36px, 5.6vw, 64px);
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
  font-size: clamp(30px, 4.6vw, 48px);
  line-height: 1.05;
  letter-spacing: -0.03em;
  text-wrap: balance;
}
.sec__body {
  display: grid;
  gap: 16px;
  min-width: 0;
}

/* a section's drawing sits on a tinted panel above its list */
.fig {
  display: grid;
  justify-items: center;
  padding: clamp(20px, 4vw, 40px);
  border-radius: 24px;
  background: var(--ncrm-tint);
}
.fig p {
  margin: 0;
}
.card {
  display: grid;
  gap: 12px;
  width: min(100%, 360px);
  padding: 20px;
  border: 1px solid var(--ncrm-line);
  border-radius: 20px;
  background: var(--ncrm-surface);
}
.card__title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.card__btn {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 20px;
  border-radius: 999px;
  background: var(--ncrm-primary);
  color: var(--ncrm-on-primary);
  font-size: 14px;
  font-weight: 600;
}
.field {
  display: grid;
  gap: 4px;
}
.field__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ncrm-muted);
}
.field__value {
  padding: 10px 12px;
  border: 1px solid var(--ncrm-line);
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
}
.field__value.is-warm {
  border-color: var(--ncrm-warm);
  font-weight: 600;
}

/* one screen, three brands */
.brands {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
}
.brand {
  display: grid;
  gap: 8px;
  align-content: start;
  padding-bottom: 14px;
  border: 1px solid var(--ncrm-line);
  border-radius: 16px;
  background: var(--ncrm-surface);
  overflow: hidden;
}
.brand__head {
  padding: 12px 10px;
  font-size: clamp(11px, 1.6vw, 14px);
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.brand--1 .brand__head {
  background: var(--ncrm-primary);
  color: var(--ncrm-on-primary);
}
.brand--2 .brand__head {
  background: var(--ncrm-navy);
  color: var(--ncrm-on-navy);
}
.brand__row,
.brand__btn {
  height: 8px;
  margin: 0 10px;
  border-radius: 999px;
  background: var(--ncrm-line);
}
.brand__row--short {
  width: 55%;
}
.brand__btn {
  width: 40%;
  height: 16px;
  margin-top: 6px;
  background: var(--ncrm-muted);
}

/* layers of protection, nested around the customer data */
.layers {
  width: min(100%, 520px);
}
.layer {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1.5px solid var(--ncrm-primary);
  border-radius: 20px;
  background: var(--ncrm-surface);
}
.layer .layer {
  border-radius: 16px;
  background: var(--ncrm-tint);
}
.layer .layer .layer {
  border-radius: 12px;
  background: var(--ncrm-surface);
}
.layer__label {
  font-size: 13px;
  font-weight: 600;
}
.layers__core {
  padding: 14px;
  border-radius: 8px;
  font-size: 16px;
  text-align: center;
}

/* the same screen in both themes (colors from .ncrm-tone-* in neocrm.css) */
.tones {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: 12px;
  width: 100%;
}
.tone {
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--ncrm-line);
  border-radius: 16px;
  background: var(--ncrm-surface);
  color: var(--ncrm-ink);
}
.tone__name {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ncrm-muted);
}
.tone__sample {
  font-size: 18px;
  letter-spacing: -0.01em;
}
.tone__row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tone__btn {
  display: inline-flex;
  align-items: center;
  height: 44px;
  padding: 0 20px;
  border-radius: 999px;
  background: var(--ncrm-primary);
  color: var(--ncrm-on-primary);
  font-size: 14px;
  font-weight: 600;
}
.tone__measure {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.consent__person {
  font-size: 15px;
  font-weight: 500;
}
.consent__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  font-size: 13px;
  color: var(--ncrm-muted);
}
.consent__state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 4px 8px;
  border-radius: 999px;
  background: var(--ncrm-primary);
  color: var(--ncrm-on-primary);
  font-weight: 600;
}
.consent__state svg,
.item__icon svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
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
.item__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: 14px;
  border-radius: 12px;
  background: var(--ncrm-tint);
  color: var(--ncrm-primary);
}
.item__icon svg {
  width: 24px;
  height: 24px;
  stroke-width: 1.7;
}

/* onboarding: four numbered stops joined by a dotted line */
.path {
  grid-template-columns: 1fr;
  gap: 0;
}
.path .item {
  position: relative;
  padding: 0 0 28px 60px;
  border: 0;
  background: none;
}
.path .item:last-child {
  padding-bottom: 0;
}
.path .item:not(:last-child)::before {
  content: "";
  position: absolute;
  left: 21px;
  top: 50px;
  bottom: 6px;
  border-left: 2px dotted var(--ncrm-muted);
}
.path__num {
  position: absolute;
  left: 0;
  top: 0;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--ncrm-primary);
  color: var(--ncrm-on-primary);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.path__num.is-warm {
  background: var(--ncrm-warm);
  color: var(--ncrm-warm-ink);
}
.path .item__title {
  padding-top: 10px;
}
@media (min-width: 640px) {
  .path {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 20px;
  }
  .path .item {
    padding: 60px 0 0;
  }
  .path .item:not(:last-child)::before {
    left: 52px;
    right: -12px;
    top: 21px;
    bottom: auto;
    border-left: 0;
    border-top: 2px dotted var(--ncrm-muted);
  }
  .path .item__title {
    padding-top: 0;
  }
}

/* work in progress reads as unfinished: dashed, no fill */
.sec--roadmap .item {
  border-style: dashed;
  background: none;
}
.pill {
  display: inline-block;
  margin-bottom: 12px;
  padding: 3px 12px;
  border: 1px solid var(--ncrm-muted);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ncrm-muted);
}
.pill--progress {
  border-color: var(--ncrm-warm);
  color: var(--ncrm-warm-ink);
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
