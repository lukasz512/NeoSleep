<!-- The neoCRM product page (CORE-215), a second page of this site at /corporativo/neocrm/. It sells the
     CRM to companies, mainly in Spain, never naming a size, and only says what the product does today (claims.ts).
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
            <p v-if="prospect" class="hero__greeting hand">{{ t("hero.greeting", { name: prospect.name }) }}</p>
            <p v-else class="hero__hello hand">{{ t("hero.hello") }}</p>
            <p class="hero__eyebrow">{{ t("hero.eyebrow") }}</p>
            <!-- one word underlined as if with a marker (hero.marks) -->
            <h1 class="hero__title">
              {{ title.before }}<span v-if="title.mark" class="mark">{{ title.mark }}<svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path d="M4 12C60 2 120 18 180 9S280 6 296 12" /></svg></span
              >{{ title.after }}
            </h1>
            <p class="hero__body">{{ t("hero.body") }}</p>
            <p class="hero__actions">
              <a class="btn" href="#demo">{{ t("hero.cta") }}</a>
              <a class="btn btn--quiet" href="#product">{{ t("hero.secondary") }}</a>
            </p>
          </div>
          <!-- drawn screens can be tried: each is one labelled group (data-fig) of real buttons -->
          <div class="shot">
            <!-- the day starts as loose notes stuck on the phone; one button files them as today's visits -->
            <div class="stage" :class="{ 'is-tidy': tidy }" role="group" data-fig :aria-label="t('visuals.hero.alt')">
              <ul class="notes" :aria-label="t('visuals.hero.notesLabel')" :aria-hidden="tidy">
                <li v-for="n in 4" :key="n" class="note hand">{{ t(`visuals.hero.notes.${n - 1}`) }}</li>
              </ul>
              <div class="phone">
                <div class="phone__screen">
                  <p class="phone__head">
                    <strong>{{ t("visuals.hero.today") }}</strong>
                    <span>{{ t("visuals.hero.count") }}</span>
                  </p>
                  <p v-if="!tidy" class="phone__empty hand">{{ t("visuals.hero.empty") }}</p>
                  <div class="phone__visits" :inert="!tidy || undefined">
                    <button v-for="n in 3" :key="n" type="button" class="visit" :aria-pressed="visit === n - 1" @click="visit = n - 1">
                      <span class="visit__who" :class="`visit__who--${n}`">{{ t(`visuals.hero.visits.${n - 1}.who`) }}</span>
                      <span class="visit__name">{{ t(`visuals.hero.visits.${n - 1}.name`) }}</span>
                      <span class="visit__time">{{ t(`visuals.hero.visits.${n - 1}.time`) }}</span>
                      <span class="visit__note">{{ t(`visuals.hero.visits.${n - 1}.note`) }}</span>
                    </button>
                    <p class="toast" :class="{ 'is-warm': tidy }" aria-live="polite">{{ t(`visuals.hero.visits.${visit}.next`) }}</p>
                  </div>
                </div>
              </div>
              <button type="button" class="tidy" :class="{ 'is-warm': !tidy }" :aria-pressed="tidy" @click="tidy = !tidy">
                {{ tidy ? t("visuals.hero.untidy") : t("visuals.hero.tidy") }}
              </button>
              <p class="stage__tip hand" aria-live="polite">
                <svg viewBox="0 0 44 34" aria-hidden="true"><path d="M40 30C30 30 14 26 8 8M2 16l6-9 8 6" /></svg>
                {{ tidy ? t("visuals.hero.tipAfter") : t("visuals.hero.tipBefore") }}
              </p>
            </div>
            <p class="shot__note">{{ t("visuals.note") }}</p>
          </div>
        </div>

        <div class="lens" role="group" aria-labelledby="lens-label">
          <p id="lens-label" class="lens__label hand">{{ t("lens.label") }}</p>
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
          <span class="sec__num hand" aria-hidden="true">{{ String(i + 1).padStart(2, "0") }}</span>
          <h2 :id="`${id}-title`" class="sec__title">{{ t(`sections.${id}.title`) }}</h2>
          <p class="sec__lead">{{ t(`sections.${id}.lead`) }}</p>
        </header>
        <div class="sec__body">
          <div v-if="id === 'product'" class="fig">
            <!-- a visit report to fill in: pick the next step, save -->
            <div class="card" role="group" data-fig :aria-label="t('visuals.product.alt')">
              <p class="card__title">{{ t("visuals.product.title") }}</p>
              <p v-for="n in 2" :key="n" class="field">
                <span class="field__label">{{ t(`visuals.product.fields.${n - 1}.label`) }}</span>
                <span class="field__value">{{ t(`visuals.product.fields.${n - 1}.value`) }}</span>
              </p>
              <div class="field" role="group" aria-labelledby="next-step-label">
                <span id="next-step-label" class="field__label">{{ t("visuals.product.nextLabel") }}</span>
                <span class="seg">
                  <button v-for="n in 3" :key="n" type="button" class="chip" :class="{ 'is-warm': step === n - 1 }" :aria-pressed="step === n - 1" @click="pickStep(n - 1)">
                    {{ t(`visuals.product.options.${n - 1}`) }}
                  </button>
                </span>
              </div>
              <button type="button" class="card__btn" @click="saved = true">{{ t("visuals.product.save") }}</button>
              <p class="card__saved" aria-live="polite">{{ saved ? t("visuals.product.saved", { step: t(`visuals.product.options.${step}`) }) : "" }}</p>
            </div>
            <p class="fig__hint hand">{{ t("visuals.product.hint") }}</p>
          </div>
          <div v-else-if="id === 'brand'" class="fig">
            <!-- one screen, re-skinned by the brand and language picked -->
            <div class="skin" role="group" data-fig :aria-label="t('visuals.brand.alt')">
              <div class="seg" role="group" :aria-label="t('visuals.brand.brandLabel')">
                <button v-for="n in 3" :key="n" type="button" class="seg__btn" :data-brand="n - 1" :aria-pressed="brand === n - 1" @click="brand = n - 1">
                  {{ t(`visuals.brand.names.${n - 1}`) }}
                </button>
              </div>
              <div class="seg" role="group" :aria-label="t('visuals.brand.langLabel')">
                <button v-for="n in 3" :key="n" type="button" class="seg__btn" :data-lang="n - 1" :aria-pressed="lang === n - 1" @click="lang = n - 1">
                  {{ t(`visuals.brand.langs.${n - 1}.code`) }}
                </button>
              </div>
              <div class="brand" :class="`brand--${brand + 1}`">
                <p class="brand__head" :class="{ 'is-warm': brand === 2 }">{{ t(`visuals.brand.names.${brand}`) }}</p>
                <p class="brand__hello">{{ t(`visuals.brand.langs.${lang}.hello`) }}</p>
                <span class="brand__row" />
                <span class="brand__row brand__row--short" />
                <span class="brand__btn">{{ t(`visuals.brand.langs.${lang}.action`) }}</span>
              </div>
            </div>
            <p class="fig__hint hand">{{ t("visuals.brand.hint") }}</p>
          </div>
          <div v-else-if="id === 'security'" class="fig">
            <!-- each layer is a button; the line below explains the one pressed (the section's first three facts) -->
            <div class="layers" role="group" data-fig :aria-label="t('visuals.security.alt')">
              <div class="layer" :class="{ 'layer--on': layer === 0 }">
                <button type="button" class="layer__label" :aria-pressed="layer === 0" @click="layer = 0">{{ t("visuals.security.layers.0") }}</button>
                <div class="layer" :class="{ 'layer--on': layer === 1 }">
                  <button type="button" class="layer__label" :aria-pressed="layer === 1" @click="layer = 1">{{ t("visuals.security.layers.1") }}</button>
                  <div class="layer" :class="{ 'layer--on': layer === 2 }">
                    <button type="button" class="layer__label" :aria-pressed="layer === 2" @click="layer = 2">{{ t("visuals.security.layers.2") }}</button>
                    <strong class="layers__core is-warm">{{ t("visuals.security.core") }}</strong>
                  </div>
                </div>
              </div>
              <p class="layers__detail" aria-live="polite">{{ t(`sections.security.items.${layer}.body`) }}</p>
            </div>
            <p class="fig__hint hand">{{ t("visuals.security.hint") }}</p>
          </div>
          <div v-else-if="id === 'access'" class="fig">
            <!-- one screen with live settings: theme and the 44 px measure -->
            <div class="skin" role="group" data-fig :aria-label="t('visuals.access.alt')">
              <div class="seg" role="group" :aria-label="t('visuals.access.themeLabel')">
                <button v-for="option in TONES" :key="option" type="button" class="seg__btn" :data-tone="option" :aria-pressed="tone === option" @click="tone = option">
                  {{ t(`visuals.access.${option}`) }}
                </button>
              </div>
              <button type="button" class="switch" role="switch" :aria-checked="measures" @click="measures = !measures">
                <span class="switch__track" aria-hidden="true" />
                {{ t("visuals.access.measures") }}
              </button>
              <div class="tone" :class="`ncrm-tone-${tone}`">
                <strong class="tone__sample">{{ t("visuals.access.sample") }}</strong>
                <span class="tone__row">
                  <span class="tone__btn" :class="{ 'tone__btn--measured': measures }">{{ t("visuals.access.button") }}</span>
                  <span v-if="measures" class="tone__measure is-warm">{{ t("visuals.access.measure") }}</span>
                </span>
              </div>
            </div>
            <p class="fig__hint hand">{{ t("visuals.access.hint") }}</p>
          </div>
          <div v-else-if="id === 'privacy'" class="fig">
            <!-- a consent record that opens its own access log -->
            <div class="card" role="group" data-fig :aria-label="t('visuals.privacy.alt')">
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
              <button type="button" class="card__link" :aria-expanded="logOpen" aria-controls="consent-log" @click="logOpen = !logOpen">{{ t("visuals.privacy.logShow") }}</button>
              <ul v-show="logOpen" id="consent-log" class="log">
                <li v-for="n in 2" :key="n">
                  <strong>{{ t(`visuals.privacy.log.${n - 1}.who`) }}</strong>
                  <span>{{ t(`visuals.privacy.log.${n - 1}.detail`) }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- who: a sector card is a button that adjusts the page (headline and link) -->
          <template v-if="id === 'who'">
            <ul class="sec__items">
              <li v-for="sector in sectors" :key="sector" class="item item--pick" :class="{ 'item--on': lens.sector === sector }">
                <span class="item__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path :d="SECTOR_ICONS[sector]" /></svg>
                </span>
                <h3 class="item__title">
                  <button type="button" class="item__pick" :data-sector="sector" :aria-pressed="lens.sector === sector" @click="setSector(sector)">
                    {{ t(`sections.who.items.${sector}.title`) }}
                  </button>
                </h3>
                <p class="item__body">{{ t(`sections.who.items.${sector}.body`) }}</p>
              </li>
            </ul>
            <p class="sec__note" aria-live="polite">{{ lens.sector ? t("sections.who.picked", { sector: t(`sections.who.items.${lens.sector}.title`) }) : t("sections.who.pick") }}</p>
          </template>
          <!-- onboarding: four numbered stops, one explained at a time -->
          <div v-else-if="id === 'onboarding'" class="steps">
            <ol class="path">
              <li v-for="(key, n) in itemKeys(id)" :key="key" class="path__step">
                <h3 class="item__title">
                  <button type="button" class="path__btn" :aria-current="stage === n ? 'step' : undefined" @click="stage = n">
                    <span class="path__num" :class="{ 'is-warm': stage === n }">{{ n + 1 }}</span>
                    {{ t(`${key}.title`) }}
                  </button>
                </h3>
              </li>
            </ol>
            <p class="steps__detail" aria-live="polite">{{ t(`sections.onboarding.items.${stage}.body`) }}</p>
          </div>
          <!-- roadmap: filter by status -->
          <template v-else-if="id === 'roadmap'">
            <div class="seg" role="group" :aria-label="t('sections.roadmap.filterLabel')">
              <button v-for="option in FILTERS" :key="option" type="button" class="seg__btn" :data-filter="option" :aria-pressed="filter === option" @click="filter = option">
                {{ option === "all" ? t("sections.roadmap.all") : t(`sections.roadmap.status.${option}`) }}
              </button>
            </div>
            <ul class="sec__items">
              <li v-for="(key, n) in itemKeys(id)" v-show="filter === 'all' || filter === ROADMAP_STATUS[n]" :key="key" class="item">
                <span class="pill" :class="[`pill--${ROADMAP_STATUS[n]}`, { 'is-warm': ROADMAP_STATUS[n] === 'progress' }]">
                  {{ t(`sections.roadmap.status.${ROADMAP_STATUS[n]}`) }}
                </span>
                <h3 class="item__title">{{ t(`${key}.title`) }}</h3>
                <p class="item__body">{{ t(`${key}.body`) }}</p>
              </li>
            </ul>
          </template>
          <!-- faq: one answer open at a time -->
          <ul v-else-if="id === 'faq'" class="faq">
            <li v-for="(key, n) in itemKeys(id)" :key="key" class="faq__item">
              <h3 class="item__title">
                <button type="button" class="faq__q" :aria-expanded="answer === n" :aria-controls="`faq-${n}`" @click="answer = answer === n ? -1 : n">
                  {{ t(`${key}.title`) }}
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </h3>
              <p v-show="answer === n" :id="`faq-${n}`" class="item__body">{{ t(`${key}.body`) }}</p>
            </li>
          </ul>
          <ul v-else class="sec__items" :class="{ 'sec__items--rows': id === 'product' }">
            <li v-for="key in itemKeys(id)" :key="key" class="item">
              <h3 class="item__title">{{ t(`${key}.title`) }}</h3>
              <p class="item__body">{{ t(`${key}.body`) }}</p>
            </li>
          </ul>
        </div>
      </section>

      <section id="demo" class="demo" aria-labelledby="demo-title">
        <p class="demo__hand hand">{{ t("contact.hand") }}</p>
        <h2 id="demo-title" class="demo__title">{{ prospect ? t("contact.titleFor", { name: prospect.name }) : t("contact.title") }}</h2>
        <p class="demo__body">{{ t("contact.body") }}</p>
        <p class="demo__actions">
          <a class="btn btn--warm is-warm" :class="{ 'is-got': landed }" :href="mailLink">{{ t("contact.email") }}</a>
          <a class="btn btn--outline" :href="whatsappLink(message)" target="_blank" rel="noopener">{{ t("contact.whatsapp") }}</a>
        </p>
      </section>
    </main>

    <footer class="foot">
      <p>{{ t("footer.note") }}</p>
      <a :href="homeLink">{{ t("footer.back") }}</a>
    </footer>
    <LivePaper @land="landed = $event" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import es from "./locales/es.json";
import LivePaper from "./LivePaper.vue";
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

/** The address follows every switch, so the page can be shared as it is being read. */
function syncLink() {
  query.value = lensQuery(query.value, lens);
  window.history.replaceState(null, "", `${window.location.pathname}${query.value}${window.location.hash}`);
}
function setRole(role: Role | null) {
  lens.role = role;
  syncLink();
}
/** Picking the sector already picked goes back to the general page. */
function setSector(sector: Sector) {
  lens.sector = lens.sector === sector ? null : sector;
  syncLink();
}

/** "Who it is for" lists the sector from the link first; picking another one on the page moves no card. */
const linked = lens.sector;
const sectors: readonly Sector[] = linked ? [linked, ...SECTORS.filter((s) => s !== linked)] : SECTORS;

/** i18n keys of a section's listed items. Security's first three are told by its layers instead. */
function itemKeys(id: SectionId): string[] {
  if (id === "who") return [];
  return es.sections[id].items.map((_, i) => `sections.${id}.items.${i}`).slice(id === "security" ? 3 : 0);
}

/** Status of each roadmap item, in the order of sections.roadmap.items. */
const ROADMAP_STATUS = ["progress", "progress", "planned", "planned"] as const;
const FILTERS = ["all", "progress", "planned"] as const;
const TONES = ["light", "dark"] as const;

/** The headline around the word hero.marks underlines; a title without that word is shown plain. */
const title = computed(() => {
  const key = lens.sector ?? "default";
  const full = t(`hero.titles.${key}`);
  const mark = t(`hero.marks.${key}`);
  const at = full.indexOf(mark);
  return at < 0 ? { before: full, mark: "", after: "" } : { before: full.slice(0, at), mark, after: full.slice(at + mark.length) };
});

// what the reader has picked inside each drawn screen; none of it is stored or sent
const tidy = ref(false);
const visit = ref(1);
const step = ref(0);
const saved = ref(false);
function pickStep(n: number) {
  step.value = n;
  saved.value = false;
}
const brand = ref(0);
const lang = ref(props.locale === "en" ? 1 : 0);
const layer = ref(0);
const tone = ref<(typeof TONES)[number]>("light");
const measures = ref(true);
const logOpen = ref(false);
const stage = ref(0);
const filter = ref<(typeof FILTERS)[number]>("all");
const answer = ref(0);
// the paper plane has reached the demo request (LivePaper.vue)
const landed = ref(false);

/** One line icon per sector, drawn as a single 24 px path. */
const SECTOR_ICONS: Record<Sector, string> = {
  equipos: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19a6 6 0 0 1 12 0M17 11.5a2.5 2.5 0 1 0 0-5M16.5 14a5 5 0 0 1 4.5 5",
  distribucion: "M2 5h11v10H2zM13 8h4.5L21 11.5V15h-8zM6.5 19.3a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM16.5 19.3a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z",
  servicios: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4",
  comercios: "M4 9l1.5-5h13L20 9M4 9h16M5 9v11h14V9M10 20v-6h4v6",
};

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
  position: relative;
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

/* glass (round 9): the paper shows through, blurred; a light edge on top, a soft shadow below.
   Only a section's outer tiles blur what is behind them; what sits inside a tile is see-through, unblurred. */
.top,
.lens,
.item,
.fig,
.steps__detail {
  border: 1px solid var(--ncrm-glass-edge);
  background: var(--ncrm-glass);
  -webkit-backdrop-filter: blur(14px) saturate(1.8);
  backdrop-filter: blur(14px) saturate(1.8);
  box-shadow:
    inset 0 1px 0 var(--ncrm-glass-hi),
    inset 0 -1px 0 var(--ncrm-glass-lo),
    0 12px 32px -14px var(--ncrm-glass-shadow);
}

/* the bar floats over the page as one glass capsule */
.top {
  position: sticky;
  top: 12px;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 12px;
  padding: 6px 8px 6px 20px;
  border-radius: 999px;
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
  box-shadow:
    inset 0 1px 0 var(--ncrm-glass-hi),
    0 8px 20px -10px var(--ncrm-glass-shadow);
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
/* the second choice is a glass capsule */
.btn--quiet {
  border: 1px solid var(--ncrm-glass-edge);
  background: var(--ncrm-glass);
  -webkit-backdrop-filter: blur(14px) saturate(1.8);
  backdrop-filter: blur(14px) saturate(1.8);
  color: var(--ncrm-primary);
}
.btn--quiet:hover {
  background: var(--ncrm-glass-inner);
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
/* the paper plane has landed on it: one ring goes out */
.btn--warm.is-got {
  animation: got 1.1s ease-out;
}
@keyframes got {
  from {
    box-shadow: 0 0 0 0 var(--ncrm-warm);
  }
  to {
    box-shadow: 0 0 0 18px transparent;
  }
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

/* handwriting: greetings, margin notes, section numbers; never body copy */
.hand {
  font-family: var(--ncrm-hand);
  font-weight: 600;
  line-height: 1.1;
}

/* the hero's drawing: loose notes stuck on a phone, filed as today's visits by one button */
.shot {
  display: grid;
  justify-items: center;
  gap: 16px;
}
.shot__note {
  margin: 0;
  font-size: 13px;
  color: var(--ncrm-muted);
  text-align: center;
}
.stage {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 20px;
  width: min(100%, 460px);
  padding-top: 12px;
}
.notes {
  position: absolute;
  inset: 0 0 auto;
  z-index: 1;
  height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.note {
  position: absolute;
  width: clamp(112px, 32%, 144px);
  min-height: 92px;
  padding: 12px 12px 16px;
  background: var(--ncrm-note-1);
  color: var(--ncrm-note-ink);
  font-size: 21px;
  font-weight: 500;
  box-shadow: 0 6px 14px var(--ncrm-note-shadow);
  transition:
    transform 0.6s cubic-bezier(0.5, 0, 0.2, 1),
    opacity 0.45s ease 0.1s;
}
.note:nth-child(1) {
  left: 0;
  top: 104px;
  transform: rotate(-5deg);
}
.note:nth-child(2) {
  right: 0;
  top: 152px;
  background: var(--ncrm-note-2);
  transform: rotate(4deg);
  transition-delay: 0.07s, 0.17s;
}
.note:nth-child(3) {
  left: 4%;
  top: 258px;
  background: var(--ncrm-note-3);
  transform: rotate(3deg);
  transition-delay: 0.14s, 0.24s;
}
.note:nth-child(4) {
  right: 3%;
  top: 306px;
  transform: rotate(-3deg);
  transition-delay: 0.21s, 0.31s;
}
/* tidied: every note flies into the middle of the screen and is gone */
.is-tidy .note {
  opacity: 0;
  pointer-events: none;
}
.is-tidy .note:nth-child(odd) {
  transform: translate(90%, 60px) scale(0.25);
}
.is-tidy .note:nth-child(even) {
  transform: translate(-90%, 20px) scale(0.25);
}
.phone {
  width: min(78%, 288px);
  padding: 10px;
  border-radius: 40px;
  background: var(--ncrm-frame);
  transform: rotate(1.5deg);
}
.phone__screen {
  position: relative;
  display: grid;
  gap: 10px;
  padding: 24px 14px 14px;
  border-radius: 30px;
  background: var(--ncrm-surface);
}
.phone__empty {
  position: absolute;
  inset: 58px 12px auto;
  font-size: 24px;
  color: var(--ncrm-muted);
  text-align: center;
}
.phone__visits {
  display: grid;
  gap: 10px;
  opacity: 0;
  transform: translateY(-8px);
  transition:
    opacity 0.4s ease,
    transform 0.4s ease;
}
.is-tidy .phone__visits {
  opacity: 1;
  transform: none;
  transition-delay: 0.35s;
}
.tidy {
  min-height: 48px;
  padding: 0 24px;
  border: 2px solid var(--ncrm-ink);
  border-radius: 999px;
  background: none;
  color: var(--ncrm-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.tidy.is-warm {
  border-color: var(--ncrm-warm);
  background: var(--ncrm-warm);
  color: var(--ncrm-warm-ink);
}
.stage__tip {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  margin: -8px 0 0;
  font-size: 24px;
  color: var(--ncrm-primary);
}
.stage__tip svg {
  flex: none;
  width: 44px;
  height: 34px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
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
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0 10px;
  padding: 12px;
  border: 1px solid var(--ncrm-line);
  border-radius: 16px;
  background: var(--ncrm-surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease;
}
.visit:hover,
.visit[aria-pressed="true"] {
  border-color: var(--ncrm-primary);
}
.visit[aria-pressed="true"] {
  box-shadow: inset 0 0 0 1px var(--ncrm-primary);
}
/* people, not icons: the initials of whoever owns the visit, on the colour of their note */
.visit__who {
  grid-row: span 2;
  align-self: center;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--ncrm-note-1);
  color: var(--ncrm-note-ink);
  font-size: 12px;
  font-weight: 700;
}
.visit__who--2 {
  background: var(--ncrm-note-2);
}
.visit__who--3 {
  background: var(--ncrm-note-3);
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
.hero__greeting,
.hero__hello {
  margin: 0 0 16px;
  font-size: clamp(28px, 3.6vw, 38px);
  color: var(--ncrm-primary);
  transform: rotate(-2deg);
  transform-origin: left;
}
.mark {
  position: relative;
  white-space: nowrap;
}
.mark svg {
  position: absolute;
  left: -4%;
  bottom: -0.2em;
  width: 108%;
  height: 0.34em;
  overflow: visible;
}
.mark path {
  fill: none;
  stroke: var(--ncrm-warm);
  stroke-width: 7;
  stroke-linecap: round;
  stroke-dasharray: 340;
  animation: mark-draw 1s 0.4s ease-out backwards;
}
@keyframes mark-draw {
  from {
    stroke-dashoffset: 340;
  }
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
  border-radius: 22px;
}
.lens__label {
  margin: 0 0 12px;
  font-size: 24px;
  color: var(--ncrm-primary);
}
.lens__options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
/* every choice on the page is a pill button, at least 44 px tall: the role lens, and the ones inside the drawings */
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.lens__option,
.seg__btn,
.chip {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--ncrm-line);
  border-radius: 999px;
  background: var(--ncrm-glass-inner);
  color: var(--ncrm-ink);
  font: inherit;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.lens__option:hover,
.seg__btn:hover,
.chip:hover {
  border-color: var(--ncrm-primary);
}
.lens__option[aria-pressed="true"],
.seg__btn[aria-pressed="true"] {
  background: var(--ncrm-primary);
  border-color: var(--ncrm-primary);
  color: var(--ncrm-on-primary);
}
.chip.is-warm {
  background: var(--ncrm-warm);
  border-color: var(--ncrm-warm);
  color: var(--ncrm-warm-ink);
  font-weight: 600;
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
  /* clear of the floating bar */
  scroll-margin-top: 88px;
}
.sec__num {
  display: inline-block;
  margin-bottom: 4px;
  font-size: 44px;
  color: var(--ncrm-primary);
  transform: rotate(-5deg);
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

/* a section's drawing sits on a glass panel above its list */
.fig {
  display: grid;
  justify-items: center;
  gap: 16px;
  padding: clamp(20px, 4vw, 40px);
  border-radius: 24px;
}
.fig p {
  margin: 0;
}
.fig__hint {
  font-size: 24px;
  color: var(--ncrm-primary);
  text-align: center;
  transform: rotate(-1.5deg);
}
/* drawings sit a little crooked, like paper laid on a desk, each section the other way */
.fig > [data-fig] {
  transform: rotate(-0.8deg);
}
.sec:nth-of-type(odd) .fig > [data-fig] {
  transform: rotate(0.8deg);
}
.card {
  display: grid;
  gap: 12px;
  width: min(100%, 400px);
  padding: 20px;
  border: 1px solid var(--ncrm-glass-edge);
  border-radius: 20px;
  background: var(--ncrm-glass-inner);
  box-shadow:
    inset 0 1px 0 var(--ncrm-glass-hi),
    0 10px 24px -14px var(--ncrm-glass-shadow);
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
  min-height: 44px;
  padding: 0 24px;
  border: 0;
  border-radius: 999px;
  background: var(--ncrm-primary);
  color: var(--ncrm-on-primary);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.card__btn:hover {
  background: var(--ncrm-primary-hover);
}
.card__saved {
  min-height: 1.5em;
  font-size: 14px;
  font-weight: 600;
  color: var(--ncrm-primary);
}
.card__link {
  justify-self: start;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ncrm-primary);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
.log {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 12px 0 0;
  border-top: 1px solid var(--ncrm-line);
  list-style: none;
  font-size: 13px;
}
.log li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 2px 12px;
}
.log span {
  color: var(--ncrm-muted);
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

/* one screen with its settings above it: brand and language, or theme and measures */
.skin {
  display: grid;
  gap: 12px;
  width: min(100%, 460px);
}
.brand {
  display: grid;
  gap: 10px;
  align-content: start;
  margin-top: 4px;
  padding-bottom: 16px;
  border: 1px solid var(--ncrm-line);
  border-radius: 16px;
  background: var(--ncrm-surface);
  overflow: hidden;
}
.brand__head {
  padding: 14px 16px;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
  transition: background-color 0.15s ease;
}
.brand--1 .brand__head {
  background: var(--ncrm-primary);
  color: var(--ncrm-on-primary);
}
.brand--2 .brand__head {
  background: var(--ncrm-navy);
  color: var(--ncrm-on-navy);
}
.brand__hello {
  padding: 4px 16px 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.brand__row {
  height: 8px;
  margin: 0 16px;
  border-radius: 999px;
  background: var(--ncrm-line);
}
.brand__row--short {
  width: 55%;
}
.brand__btn {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  margin: 4px 16px 0;
  padding: 0 16px;
  border-radius: 999px;
  background: var(--ncrm-ink);
  color: var(--ncrm-surface);
  font-size: 13px;
  font-weight: 600;
}
.switch {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ncrm-ink);
  font: inherit;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}
.switch__track {
  position: relative;
  width: 44px;
  height: 26px;
  border-radius: 999px;
  background: var(--ncrm-muted);
  transition: background-color 0.15s ease;
}
.switch__track::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--ncrm-surface);
  transition: transform 0.15s ease;
}
.switch[aria-checked="true"] .switch__track {
  background: var(--ncrm-primary);
}
.switch[aria-checked="true"] .switch__track::after {
  transform: translateX(18px);
}

/* layers of protection, nested around the customer data */
.layers {
  display: grid;
  gap: 12px;
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
.layer--on {
  box-shadow: 0 0 0 2px var(--ncrm-primary);
}
.layer__label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--ncrm-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.layer__label::before {
  content: "";
  flex: none;
  width: 12px;
  height: 12px;
  border: 2px solid var(--ncrm-primary);
  border-radius: 50%;
}
.layer__label[aria-pressed="true"]::before {
  background: var(--ncrm-primary);
}
.layers__core {
  padding: 14px;
  border-radius: 8px;
  font-size: 16px;
  text-align: center;
}
.layers__detail {
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--ncrm-glass-inner);
  font-size: 15px;
}

/* the example screen in the theme picked (colors from .ncrm-tone-* in neocrm.css) */
.tone {
  display: grid;
  gap: 12px;
  margin-top: 4px;
  padding: 20px;
  border: 1px solid var(--ncrm-line);
  border-radius: 16px;
  background: var(--ncrm-surface);
  color: var(--ncrm-ink);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.tone__btn--measured {
  outline: 2px dashed var(--ncrm-ink);
  outline-offset: 3px;
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
  border-radius: 20px;
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

/* who: the whole card is the button (its ::after covers the card) */
.item--pick {
  position: relative;
  transition: border-color 0.15s ease;
}
.item--pick:hover,
.item--on {
  border-color: var(--ncrm-primary);
}
.item--on {
  box-shadow: inset 0 0 0 1px var(--ncrm-primary);
}
.item--on .item__icon {
  background: var(--ncrm-primary);
  color: var(--ncrm-on-primary);
}
.item__pick {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.item__pick::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 20px;
}
.item__pick:focus-visible {
  outline: none;
}
.item__pick:focus-visible::after {
  outline: 3px solid var(--ncrm-primary);
  outline-offset: 3px;
}
.sec__note {
  margin: 0;
  font-size: 14px;
  color: var(--ncrm-muted);
}

/* product: plain rows, not cards */
.sec__items--rows {
  gap: 20px 24px;
  margin-top: 8px;
}
.sec__items--rows .item {
  padding: 2px 0 2px 16px;
  border: 0;
  border-left: 3px solid var(--ncrm-primary);
  border-radius: 0;
  background: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  box-shadow: none;
}

/* onboarding: four numbered stops joined by a dotted line; the one picked is explained below */
.steps {
  display: grid;
  gap: 20px;
}
.path {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.path__step {
  position: relative;
}
.path__btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 4px 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: inherit;
  text-align: left;
  cursor: pointer;
}
.path__num {
  flex: none;
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
.steps__detail {
  margin: 0;
  padding: 20px 24px;
  border-radius: 20px;
  font-size: clamp(17px, 2vw, 20px);
  text-wrap: balance;
}
@media (min-width: 640px) {
  .path {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 20px;
  }
  .path__btn {
    flex-direction: column;
    align-items: flex-start;
  }
  .path__step:not(:last-child)::before {
    content: "";
    position: absolute;
    left: 52px;
    right: -12px;
    top: 25px;
    border-top: 2px dotted var(--ncrm-muted);
    pointer-events: none;
  }
}

/* faq: questions open one at a time; the plus turns into a cross */
.faq {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--ncrm-line);
  list-style: none;
}
.faq__item {
  border-bottom: 1px solid var(--ncrm-line);
}
.faq__q {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  min-height: 64px;
  padding: 12px 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: inherit;
  text-align: left;
  cursor: pointer;
}
.faq__q svg {
  flex: none;
  width: 20px;
  height: 20px;
  fill: none;
  stroke: var(--ncrm-primary);
  stroke-width: 2;
  stroke-linecap: round;
  transition: transform 0.15s ease;
}
.faq__q[aria-expanded="true"] svg {
  transform: rotate(45deg);
}
.faq__item .item__body {
  margin: 0;
  padding: 0 0 20px;
  max-width: 60ch;
}

/* work in progress reads as unfinished: dashed, no fill */
.sec--roadmap .item {
  border: 1px dashed var(--ncrm-muted);
  background: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  box-shadow: none;
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
@media (min-width: 900px) {
  .sec {
    grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
    gap: 48px;
  }
  .sec__head {
    position: sticky;
    top: 92px;
    align-self: start;
  }
}

.demo {
  margin: clamp(24px, 5vw, 56px) 0;
  padding: clamp(32px, 6vw, 72px);
  border: 1px solid var(--ncrm-glass-edge);
  border-radius: 28px;
  background: var(--ncrm-band-glass);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
  backdrop-filter: blur(16px) saturate(1.6);
  box-shadow: 0 24px 48px -24px var(--ncrm-glass-shadow);
  color: var(--ncrm-on-band);
  scroll-margin-top: 88px;
}
.demo__hand {
  margin: 0 0 8px;
  font-size: 36px;
  color: var(--ncrm-warm);
  transform: rotate(-2deg);
  transform-origin: left;
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
