<template>
  <header ref="bar" class="head" :class="{ 'head--solid': solid, 'head--hidden': hidden }">
    <a class="head__logo" href="#top"><AjLogo label="AJ Management" /></a>
    <nav class="head__nav" :aria-label="t('nav.aria')">
      <a href="#proyectos">{{ t("nav.projects") }}</a>
      <a href="#capacidades">{{ t("nav.capabilities") }}</a>
      <a href="#nosotros">{{ t("nav.about") }}</a>
      <a href="#contacto">{{ t("nav.contact") }}</a>
      <a class="head__lang" :href="otherPath" :aria-label="t('nav.languageAria')" :hreflang="otherLocale">{{ t("nav.language") }}</a>
      <ThemeSwitch :lite="lite" />
    </nav>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AjLogo from "./AjLogo.vue";
import ThemeSwitch from "./ThemeSwitch.vue";
import { PATH_ROUTING, switchLocalePath, type Locale } from "../lib/locale";

const props = defineProps<{ locale: Locale; lite: boolean }>();
const { t } = useI18n();

const otherLocale = computed<Locale>(() => (props.locale === "es" ? "en" : "es"));
const otherPath = computed(() => switchLocalePath(otherLocale.value, window.location.search, PATH_ROUTING));

// Transparent over the hero, paper-coloured once the hero has scrolled away;
// slides out while reading downwards and comes back on the first scroll up.
const solid = ref(false);
const hidden = ref(false);
let lastY = 0;
function onScroll() {
  const y = window.scrollY;
  solid.value = y > window.innerHeight * 0.8;
  if (Math.abs(y - lastY) <= 4) return;
  hidden.value = y > window.innerHeight && y > lastY;
  lastY = y;
}
// Sticky parts on phones (Privalia's year, the Capabilities still) sit right under the bar: they read
// --head-offset, the bar's height while it shows and 0 while it is slid away (round 8: otherwise
// the page scrolled through the gap above them).
const bar = ref<HTMLElement | null>(null);
let ro: ResizeObserver | null = null;
function publishOffset() {
  const h = hidden.value ? 0 : Math.round(bar.value?.getBoundingClientRect().height ?? 0);
  document.documentElement.style.setProperty("--head-offset", `${h}px`);
}
watch(hidden, publishOffset);
onMounted(() => {
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  publishOffset();
  if (typeof ResizeObserver !== "undefined" && bar.value) {
    ro = new ResizeObserver(publishOffset);
    ro.observe(bar.value);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
  ro?.disconnect();
});
</script>

<style scoped>
.head {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: calc(14px + env(safe-area-inset-top)) var(--ajm-gutter) 14px;
  color: var(--ajm-on-stage);
  transition: background-color 0.4s ease, color 0.4s ease, transform 0.5s var(--ajm-ease);
}
.head--hidden {
  transform: translateY(-100%);
}
.head--solid {
  background: var(--ajm-paper);
  color: var(--ajm-ink);
  border-bottom: 1px solid var(--ajm-line);
}
.head__logo {
  display: block;
  height: 26px;
}
.head__nav {
  display: flex;
  align-items: center;
  gap: clamp(14px, 3vw, 32px);
  font: 500 12px var(--ajm-font);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.head__nav a {
  position: relative;
  text-decoration: none;
  padding: 6px 0;
}
.head__nav a::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 2px;
  height: 1px;
  background: currentColor;
  transform: scaleX(0);
  transform-origin: right;
  transition: transform 0.45s var(--ajm-ease);
}
.head__nav a:hover::after {
  transform: scaleX(1);
  transform-origin: left;
}
.head__lang {
  opacity: 0.75;
}
@media (max-width: 720px) {
  .head__nav a:not(.head__lang) {
    display: none;
  }
}
</style>
