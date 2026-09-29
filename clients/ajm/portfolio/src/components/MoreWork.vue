<!-- More projects: events beyond the four proposal cases (content/more.ts). Each is a title line and a
     strip of four stills from its video that open full screen. Quieter than the cases on purpose. -->
<template>
  <section id="mas" class="more">
    <p v-reveal class="eyebrow">{{ t("more.eyebrow") }}</p>
    <p v-reveal="{ delay: 100 }" class="more__lead">{{ t("more.lead") }}</p>

    <article v-for="(p, i) in MORE_PROJECTS" :key="p.id" class="proj">
      <header class="proj__head">
        <h4 v-reveal class="proj__title">{{ p.title }}</h4>
        <p v-reveal="{ delay: 80 }" class="proj__meta">
          {{ [t(`more.items.${p.id}.kind`), t(`more.items.${p.id}.place`), p.year].filter(Boolean).join(" · ") }}
        </p>
      </header>
      <div class="proj__strip">
        <button
          v-for="(f, j) in p.photos"
          :key="f"
          v-reveal="{ variant: 'scale', delay: j * 90 }"
          type="button"
          class="proj__photo"
          :aria-label="t('media.enlarge')"
          @click="open(i, j)"
        >
          <picture>
            <source :srcset="picture(`more/${f}-640`).avif" type="image/avif" />
            <img :src="picture(`more/${f}-640`).jpg" :alt="t('more.photoAlt', { event: p.title })" loading="lazy" decoding="async" />
          </picture>
        </button>
      </div>
    </article>
    <PhotoLightbox v-model:index="viewing" :photos="lightboxPhotos" :labels="lbLabels" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import PhotoLightbox, { type LightboxPhoto } from "./PhotoLightbox.vue";
import { MORE_PROJECTS } from "../content/more";
import { picture } from "../lib/media";
import { vReveal } from "../lib/motion";

const { t } = useI18n();

const viewing = ref<number | null>(null);
const viewingProject = ref(0);
function open(i: number, j: number) {
  viewingProject.value = i;
  viewing.value = j;
}
const lightboxPhotos = computed<LightboxPhoto[]>(() => {
  const p = MORE_PROJECTS[viewingProject.value] ?? MORE_PROJECTS[0]!;
  const caption = [t(`more.items.${p.id}.kind`), t(`more.items.${p.id}.place`), p.year].filter(Boolean).join(" · ");
  return p.photos.map((f) => ({ src: picture(`more/${f}-1280`), title: p.title, caption }));
});
const lbLabels = computed(() => ({ prev: t("media.prev"), next: t("media.next"), close: t("media.close") }));
</script>

<style scoped>
.more {
  padding: clamp(72px, 10vw, 140px) var(--ajm-gutter);
  border-top: 1px solid var(--ajm-line);
}
.more__lead {
  margin: 16px 0 clamp(32px, 5vw, 64px);
  max-width: 820px;
  font: 500 clamp(22px, 2.6vw, 36px) / 1.25 var(--ajm-font);
  letter-spacing: -0.01em;
}
.proj + .proj {
  margin-top: clamp(48px, 7vw, 96px);
}
.proj__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 24px;
  padding-top: 16px;
  border-top: 1px solid var(--ajm-line);
  margin-bottom: clamp(14px, 2vw, 24px);
}
.proj__title {
  margin: 0;
  font: 500 clamp(24px, 2.8vw, 42px) / 1.05 var(--ajm-font);
  letter-spacing: -0.02em;
}
.proj__meta {
  margin: 0;
  font-size: 14px;
  color: var(--ajm-muted);
}
.proj__strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: clamp(8px, 1.2vw, 16px);
}
.proj__photo {
  display: block;
  padding: 0;
  border: 0;
  background: var(--ajm-line);
  overflow: hidden;
  cursor: zoom-in;
  aspect-ratio: 4 / 5;
}
.proj__photo picture,
.proj__photo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.proj__photo img {
  transition: transform 0.8s var(--ajm-ease);
}
.proj__photo:hover img {
  transform: scale(1.04);
}
.proj__photo:focus-visible {
  outline: 2px solid var(--ajm-ink);
  outline-offset: 3px;
}
@media (max-width: 860px) {
  .proj__strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
