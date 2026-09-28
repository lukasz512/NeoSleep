<template>
  <EntryOverlay
    :kind="entry"
    :photo="entryPhoto"
    :skip-label="t('entry.skip')"
    :kicker="t('entry.kicker')"
    @open="heroReady = true"
  />
  <SiteHeader :locale="locale" />
  <main>
    <HeroSection :lite="lite" :ready="heroReady" />
    <WhatWeDo :lite="lite" />
    <CapabilitiesSection />
    <section id="proyectos" class="projects">
      <p v-reveal class="eyebrow">{{ t("projects.eyebrow") }}</p>
      <p v-reveal="{ delay: 100 }" class="projects__lead">{{ t("projects.lead") }}</p>
    </section>
    <CaseUniversal :lite="lite" />
    <CasePlaneta />
    <CasePrivalia :lite="lite" />
    <CaseMendel :lite="lite" />
    <ProcessSection :lite="lite" />
    <ClientsSection />
    <AboutSection />
    <ContactSection :lite="lite" />
  </main>
  <footer class="foot">
    <p>{{ t("footer.privacy") }}</p>
    <p>{{ t("footer.rights", { year: new Date().getFullYear() }) }}</p>
  </footer>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import EntryOverlay from "./components/EntryOverlay.vue";
import SiteHeader from "./components/SiteHeader.vue";
import HeroSection from "./components/HeroSection.vue";
import WhatWeDo from "./components/WhatWeDo.vue";
import CapabilitiesSection from "./components/CapabilitiesSection.vue";
import CaseUniversal from "./components/CaseUniversal.vue";
import CasePlaneta from "./components/CasePlaneta.vue";
import CasePrivalia from "./components/CasePrivalia.vue";
import CaseMendel from "./components/CaseMendel.vue";
import ProcessSection from "./components/ProcessSection.vue";
import ClientsSection from "./components/ClientsSection.vue";
import AboutSection from "./components/AboutSection.vue";
import ContactSection from "./components/ContactSection.vue";
import { pickEntry, type EntryKind } from "./lib/entry";
import { mediaUrl } from "./lib/media";
import { vReveal } from "./lib/motion";
import type { Locale } from "./lib/locale";

const props = defineProps<{ locale: Locale; lite: boolean }>();
const { t } = useI18n();

document.title = t("meta.title");

// The entry plays on every load, so every load starts at the top (the browser would otherwise
// restore the old scroll position behind the overlay).
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.scrollTo(0, 0);

const entry: EntryKind = pickEntry({ search: window.location.search, lite: props.lite });
const heroReady = ref(false);
// A neutral, text-free frame (Universal lounge) so the QR mosaic reads as a photo, not a logo.
const entryPhoto = mediaUrl("universal/lounge.jpg");
</script>

<style scoped>
.projects {
  padding: clamp(72px, 10vw, 120px) var(--ajm-gutter) 0;
}
.projects__lead {
  margin: 16px 0 0;
  max-width: 820px;
  font: 500 clamp(22px, 2.6vw, 36px) / 1.25 var(--ajm-font);
  letter-spacing: -0.01em;
}
.foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 24px;
  padding: 24px var(--ajm-gutter) calc(24px + env(safe-area-inset-bottom));
  font-size: 12px;
  color: var(--ajm-muted);
  background: var(--ajm-paper);
}
.foot p {
  margin: 0;
  max-width: 640px;
}
</style>
