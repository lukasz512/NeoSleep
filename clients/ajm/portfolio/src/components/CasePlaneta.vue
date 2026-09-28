<!-- Case 02 · Grupo Planeta, "index + stage" (G3 = G-B, 2026-09-28): the launches are a list on the
     left; the active one fills a large stage on the right with its photos. Desktop: hover/focus/click
     picks a launch, and the launch crossing the middle of the screen becomes active while scrolling.
     Phones: the stage sits above the list and follows scroll the same way. Photos open full screen.
     Only originals ≥1600 px are used large (content/planeta.ts). -->
<template>
  <article id="planeta" ref="root" class="case" :class="{ 'is-in': seen }">
    <header class="case__head">
      <p class="eyebrow">{{ t("planeta.number") }} · {{ t("planeta.client") }}</p>
      <h3 class="case__title">
        <span class="mask-line"><span><AccentText :text="t('planeta.title')" :stroke="1" /></span></span>
      </h3>
      <p class="case__tags">{{ t("planeta.tags") }} · {{ t("planeta.city") }}</p>
      <p class="case__body">{{ t("planeta.body") }}</p>
    </header>

    <div class="ix">
      <ol class="ix__list">
        <li
          v-for="(ev, i) in events"
          :key="ev.id"
          :ref="(el) => (rows[i] = el as HTMLElement | null)"
          v-reveal="{ delay: i * 60 }"
          :data-index="i"
        >
          <button
            type="button"
            class="ix__item"
            :class="{ on: i === active }"
            :aria-pressed="i === active"
            @mouseenter="active = i"
            @focus="active = i"
            @click="active = i"
          >
            <span class="ix__year">{{ ev.year ?? "—" }}</span>
            <span class="ix__title">{{ ev.title }}</span>
            <span class="ix__kind">{{ t(`planeta.events.${ev.id}`) }}</span>
          </button>
        </li>
      </ol>

      <div class="ix__stage">
        <TransitionGroup name="st" tag="div" class="ix__frame">
          <button
            v-for="(p, j) in current.photos.slice(0, 1)"
            :key="`${current.id}-${p}`"
            type="button"
            class="ix__lead"
            :aria-label="t('media.enlarge')"
            @click="viewing = j"
          >
            <picture>
              <source :srcset="picture(photoBase(p, true)).avif" type="image/avif" />
              <img :src="picture(photoBase(p, true)).jpg" :alt="t('planeta.photoAlt', { event: current.title })" decoding="async" />
            </picture>
          </button>
        </TransitionGroup>
        <div class="ix__meta">
          <span class="ix__metaTitle">{{ current.title }}</span>
          <span class="ix__metaLine">
            {{ t(`planeta.events.${current.id}`) }}<template v-if="current.year"> · {{ current.year }}</template>
            · {{ t("planeta.photoCount", { n: current.photos.length }) }}
          </span>
        </div>
        <div class="ix__thumbs">
          <button
            v-for="(p, j) in current.photos"
            :key="`${current.id}-t-${p}`"
            type="button"
            class="ix__thumb"
            :aria-label="t('media.enlarge')"
            @click="viewing = j"
          >
            <picture>
              <source :srcset="picture(photoBase(p, false)).avif" type="image/avif" />
              <img :src="picture(photoBase(p, false)).jpg" alt="" loading="lazy" decoding="async" />
            </picture>
          </button>
        </div>
      </div>
    </div>
    <PhotoLightbox v-model:index="viewing" :photos="lightboxPhotos" :labels="lbLabels" />
  </article>
</template>

<script setup lang="ts">
import AccentText from "./AccentText.vue";
import PhotoLightbox, { type LightboxPhoto } from "./PhotoLightbox.vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { PLANETA_VISIBLE, photoBase, type PlanetaEvent } from "../content/planeta";
import { picture } from "../lib/media";
import { useInView } from "../lib/useInView";
import { vReveal } from "../lib/motion";

const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
const seen = useInView(root, "-10%");
const events = PLANETA_VISIBLE;
const active = ref(0);
const current = computed<PlanetaEvent>(() => events[active.value] ?? events[0]!);
const rows = ref<(HTMLElement | null)[]>([]);

// The launch crossing the middle band of the screen becomes active while scrolling.
let io: IntersectionObserver | null = null;
onMounted(() => {
  if (typeof IntersectionObserver === "undefined") return;
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) active.value = Number((e.target as HTMLElement).dataset.index);
    },
    { rootMargin: "-48% 0px -48% 0px" },
  );
  rows.value.forEach((r) => r && io?.observe(r));
});
onBeforeUnmount(() => io?.disconnect());

// The active launch's photos, largest file available, with a one-line description.
const viewing = ref<number | null>(null);
const lightboxPhotos = computed<LightboxPhoto[]>(() => {
  const ev = current.value;
  const caption = [t(`planeta.events.${ev.id}`), ev.year, t("planeta.client"), t("planeta.city")].filter(Boolean).join(" · ");
  return ev.photos.map((p) => ({ src: picture(photoBase(p, true)), title: ev.title, caption }));
});
const lbLabels = computed(() => ({ prev: t("media.prev"), next: t("media.next"), close: t("media.close") }));
</script>

<style scoped>
.case {
  padding: clamp(72px, 10vw, 140px) var(--ajm-gutter);
  border-top: 1px solid var(--ajm-line);
}
.case__head {
  max-width: 900px;
  margin-bottom: clamp(32px, 5vw, 56px);
}
.case__title {
  margin: 12px 0;
  font: 500 clamp(32px, 5vw, 72px) / 1 var(--ajm-font);
  letter-spacing: -0.02em;
}
.case__tags {
  margin: 0 0 20px;
  color: var(--ajm-muted);
  font-size: 14px;
  letter-spacing: 0.04em;
}
.case__body {
  margin: 0;
  max-width: 620px;
  font-size: clamp(17px, 1.5vw, 21px);
  color: var(--ajm-ink-soft);
}

.ix {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: clamp(24px, 5vw, 72px);
  align-items: start;
}
.ix__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--ajm-line);
}
.ix__item {
  width: 100%;
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 2px 14px;
  align-items: baseline;
  padding: clamp(14px, 1.8vw, 22px) 0;
  border: 0;
  border-bottom: 1px solid var(--ajm-line);
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.ix__year {
  grid-row: span 2;
  font: italic 400 20px var(--ajm-display);
  color: var(--ajm-muted);
}
.ix__title {
  font: 500 clamp(20px, 2.2vw, 30px) / 1.15 var(--ajm-font);
  letter-spacing: -0.01em;
  color: var(--ajm-faint);
  transition:
    color 0.4s ease,
    transform 0.5s var(--ajm-ease);
}
.ix__kind {
  font-size: 13px;
  color: var(--ajm-muted);
}
.ix__item.on .ix__title,
.ix__item:hover .ix__title {
  color: var(--ajm-ink);
}
.ix__item.on .ix__title {
  transform: translateX(8px);
}
.ix__item:focus-visible {
  outline: 2px solid var(--ajm-ink);
  outline-offset: 2px;
}

.ix__stage {
  position: sticky;
  top: 12vh;
  display: grid;
  gap: 12px;
}
.ix__frame {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--ajm-line);
}
.ix__lead {
  position: absolute;
  inset: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
}
.ix__lead picture,
.ix__lead img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
/* the new launch wipes in over the old one */
.st-enter-active {
  transition: clip-path 0.9s var(--ajm-ease);
  z-index: 1;
}
.st-enter-active img {
  transition: transform 1.3s var(--ajm-ease);
}
.st-enter-from {
  clip-path: inset(0 0 0 100%);
}
.st-enter-from img {
  transform: scale(1.08);
}
.st-leave-active {
  transition: opacity 0.9s ease;
}
.st-leave-to {
  opacity: 0.999;
}
.ix__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
}
.ix__metaTitle {
  font: 500 16px var(--ajm-font);
}
.ix__metaLine {
  font-size: 13px;
  color: var(--ajm-muted);
}
.ix__thumbs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ix__thumb {
  width: 72px;
  height: 52px;
  padding: 0;
  border: 0;
  background: none;
  overflow: hidden;
  cursor: zoom-in;
  opacity: 0.7;
  transition: opacity 0.3s ease;
}
.ix__thumb:hover,
.ix__thumb:focus-visible {
  opacity: 1;
}
.ix__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (max-width: 860px) {
  .ix {
    grid-template-columns: 1fr;
  }
  .ix__stage {
    grid-row: 1;
    top: 60px;
    z-index: 2;
    background: var(--ajm-paper);
    padding-bottom: 8px;
  }
  .ix__frame {
    aspect-ratio: 16 / 10;
  }
  .ix__thumbs {
    display: none;
  }
}
</style>
