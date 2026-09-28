<template>
  <header class="head" :class="{ 'head--solid': solid }">
    <a class="head__logo" href="#top"><AjLogo label="AJ Management" /></a>
    <nav class="head__nav" :aria-label="t('nav.projects')">
      <a href="#proyectos">{{ t("nav.projects") }}</a>
      <a href="#contacto">{{ t("nav.contact") }}</a>
      <a class="head__lang" :href="otherPath" :aria-label="t('nav.languageAria')" :hreflang="otherLocale">{{ t("nav.language") }}</a>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import AjLogo from "./AjLogo.vue";
import { PATH_ROUTING, switchLocalePath, type Locale } from "../lib/locale";

const props = defineProps<{ locale: Locale }>();
const { t } = useI18n();

const otherLocale = computed<Locale>(() => (props.locale === "es" ? "en" : "es"));
const otherPath = computed(() => switchLocalePath(otherLocale.value, window.location.search, PATH_ROUTING));

// Transparent over the hero, paper-coloured once the hero has scrolled away.
const solid = ref(false);
function onScroll() {
  solid.value = window.scrollY > window.innerHeight * 0.8;
}
onMounted(() => {
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
});
onBeforeUnmount(() => window.removeEventListener("scroll", onScroll));
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
  color: var(--ajm-paper);
  transition: background-color 0.4s ease, color 0.4s ease;
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
  gap: clamp(14px, 3vw, 32px);
  font: 500 12px var(--ajm-font);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.head__nav a {
  text-decoration: none;
  padding: 6px 0;
}
.head__lang {
  opacity: 0.75;
}
@media (max-width: 560px) {
  .head__nav a:not(.head__lang) {
    display: none;
  }
}
</style>
