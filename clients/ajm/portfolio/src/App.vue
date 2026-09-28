<template>
  <EntryOverlay :kind="entry" :photo="entryPhoto" :skip-label="t('entry.skip')" @done="onEntryDone" />
  <SiteHeader :locale="locale" />
  <main>
    <HeroSection :lite="lite" :ready="entryDone" />
    <WhatWeDo :lite="lite" />
    <section id="proyectos" class="projects">
      <p class="eyebrow">{{ t("projects.eyebrow") }}</p>
      <p class="projects__lead">{{ t("projects.lead") }}</p>
    </section>
    <CaseUniversal :lite="lite" />
    <CasePlaneta />
    <ContactSection />
  </main>
  <footer class="foot">
    <p>{{ t("footer.privacy") }}</p>
    <p>{{ t("footer.rights", { year: new Date().getFullYear() }) }}</p>
  </footer>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import EntryOverlay from "./components/EntryOverlay.vue";
import SiteHeader from "./components/SiteHeader.vue";
import HeroSection from "./components/HeroSection.vue";
import WhatWeDo from "./components/WhatWeDo.vue";
import CaseUniversal from "./components/CaseUniversal.vue";
import CasePlaneta from "./components/CasePlaneta.vue";
import ContactSection from "./components/ContactSection.vue";
import { pickEntry, type EntryKind } from "./lib/entry";
import { entryPlayed, lastSection, markEntryPlayed, rememberSection } from "./lib/session";
import { mediaUrl } from "./lib/media";
import type { Locale } from "./lib/locale";

const props = defineProps<{ locale: Locale; lite: boolean }>();
const { t } = useI18n();

document.title = t("meta.title");

const entry = ref<EntryKind>(
  pickEntry({ search: window.location.search, lite: props.lite, playedThisSession: entryPlayed() }),
);
const entryDone = ref(entry.value === "none");
// A neutral, text-free frame (Universal lounge) so the QR mosaic reads as a photo, not a logo.
const entryPhoto = mediaUrl("universal/lounge.jpg");

function onEntryDone() {
  entryDone.value = true;
  markEntryPlayed();
}

// A reload returns to the section the visitor was reading (sessionStorage only, no cookies).
let observer: IntersectionObserver | null = null;
onMounted(() => {
  const saved = lastSection();
  if (entry.value === "none" && saved && saved !== "top") {
    document.getElementById(saved)?.scrollIntoView();
  }
  if (typeof IntersectionObserver === "undefined") return;
  observer = new IntersectionObserver(
    (entries) => entries.filter((e) => e.isIntersecting).forEach((e) => rememberSection(e.target.id)),
    { threshold: 0.5 },
  );
  document.querySelectorAll("main [id]").forEach((el) => observer?.observe(el));
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<style scoped>
.projects {
  padding: clamp(72px, 10vw, 120px) var(--ajm-gutter) 0;
  border-top: 1px solid var(--ajm-line);
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
