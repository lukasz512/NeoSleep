<!-- Case 02 · Grupo Planeta: the only photo-led case. A bookshelf of event "spines";
     opening one shows its photos. Only originals ≥1600 px are shown large (content/planeta.ts). -->
<template>
  <article id="planeta" ref="root" class="case" :class="{ 'is-in': seen }">
    <header class="case__head">
      <p class="eyebrow">{{ t("planeta.number") }} · {{ t("planeta.client") }}</p>
      <h3 class="case__title">
        <span class="mask-line"><span><AccentText :text="t('planeta.title')" /></span></span>
      </h3>
      <p class="case__tags">{{ t("planeta.tags") }} · {{ t("planeta.city") }}</p>
      <p class="case__body">{{ t("planeta.body") }}</p>
    </header>

    <p class="shelf__hint eyebrow">{{ t("planeta.dragHint") }} →</p>
    <div class="shelf" role="list">
      <div
        v-for="(ev, i) in events"
        :key="ev.id"
        class="book"
        :class="{ open: i === openIndex }"
        role="listitem"
      >
        <button
          type="button"
          class="book__spine"
          :aria-expanded="i === openIndex"
          :aria-controls="`book-${ev.id}`"
          @click="openIndex = i"
        >
          <span class="book__year">{{ ev.year ?? "" }}</span>
          <span class="book__title">{{ ev.title }}</span>
        </button>
        <div :id="`book-${ev.id}`" class="book__pages" :hidden="i !== openIndex">
          <p class="book__meta">
            <strong>{{ ev.title }}</strong> · {{ t(`planeta.events.${ev.id}`) }}<template v-if="ev.year"> · {{ ev.year }}</template>
            <span class="book__count">{{ t("planeta.photoCount", { n: ev.photos.length }) }}</span>
          </p>
          <div class="book__grid">
            <picture v-for="(p, j) in ev.photos" :key="p" :class="{ big: j === 0 && LARGE_PHOTOS.has(p) }">
              <source :srcset="picture(photoBase(p, j === 0)).avif" type="image/avif" />
              <img
                :src="picture(photoBase(p, j === 0)).jpg"
                :alt="t('planeta.photoAlt', { event: ev.title })"
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import AccentText from "./AccentText.vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { LARGE_PHOTOS, PLANETA_EVENTS, photoBase } from "../content/planeta";
import { picture } from "../lib/media";
import { useInView } from "../lib/useInView";

const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
const seen = useInView(root, "-10%");
const events = PLANETA_EVENTS;
const openIndex = ref(0);
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
.shelf__hint {
  margin: 0 0 14px;
}
.shelf {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: 12px;
  margin: 0 calc(-1 * var(--ajm-gutter));
  padding-inline: var(--ajm-gutter);
  scrollbar-width: thin;
}
.book {
  display: flex;
  flex: 0 0 auto;
  scroll-snap-align: start;
  min-height: min(72svh, 620px);
}
.book__spine {
  width: 76px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  gap: 18px;
  padding: 18px 0;
  border: 1px solid var(--ajm-line);
  background: var(--ajm-paper);
  color: var(--ajm-ink);
  cursor: pointer;
  transition: background-color 0.4s ease, color 0.4s ease;
}
.book__spine:hover,
.book.open .book__spine {
  background: var(--ajm-ink);
  color: var(--ajm-paper);
}
.book__year {
  font: 500 11px var(--ajm-font);
  letter-spacing: 0.12em;
}
.book__title {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font: 500 18px var(--ajm-serif);
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.book__pages {
  width: min(78vw, 980px);
  padding: 0 0 0 16px;
  animation: pages 0.7s var(--ajm-ease);
}
.book__pages[hidden] {
  display: none;
}
@keyframes pages {
  from {
    clip-path: inset(0 100% 0 0);
  }
  to {
    clip-path: inset(0 0 0 0);
  }
}
.book__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: baseline;
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--ajm-ink-soft);
}
.book__count {
  margin-left: auto;
  color: var(--ajm-muted);
  font-size: 12px;
  letter-spacing: 0.08em;
}
.book__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-auto-rows: 180px;
  gap: 6px;
}
.book__grid picture.big {
  grid-column: span 2;
  grid-row: span 2;
}
.book__grid img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 2px;
}
@media (max-width: 600px) {
  .book__pages {
    width: 82vw;
  }
  .book__grid {
    grid-template-columns: repeat(2, 1fr);
    grid-auto-rows: 120px;
  }
}
</style>
