<!-- Section 03 · Capacidades, on charcoal. Six big numbered rows that open one at a time like an
     accordion as they cross the middle of the screen (round 8: every visitor sees all six while
     scrolling; hover/focus still opens a row directly). The open row lights up, shows its text, and a
     production still wipes in beside it. Stills are text-free frames from AJM's own footage. -->
<template>
  <section id="capacidades" ref="root" class="caps" :class="{ 'is-in': seen }">
    <header class="caps__head">
      <p class="eyebrow caps__eyebrow">{{ t("capabilities.eyebrow") }}</p>
      <h2 class="caps__title">
        <span class="mask-line"><span><AccentText :text="t('capabilities.title1')" /></span></span>
        <span class="mask-line"><span><AccentText :text="t('capabilities.title2')" /></span></span>
      </h2>
    </header>

    <div class="caps__body">
      <ol class="caps__list" :class="{ 'has-active': active !== null }">
        <li
          v-for="(item, i) in items"
          :key="item.title"
          :ref="(el) => (rows[i] = el as HTMLElement | null)"
          v-reveal="{ delay: i * 60 }"
          class="cap"
          :class="{ on: active === i }"
          :data-index="i"
          tabindex="0"
          @mouseenter="active = i"
          @focus="active = i"
        >
          <span class="cap__num">{{ String(i + 1).padStart(2, "0") }}</span>
          <span class="cap__text">
            <span class="cap__title">{{ item.title }}</span>
            <span class="cap__desc">{{ item.body }}</span>
          </span>
        </li>
      </ol>

      <div class="caps__stage" aria-hidden="true">
        <picture v-for="(_, i) in items" :key="i" class="caps__still" :class="{ on: shown === i }">
          <source :srcset="picture(`capabilities/c${i + 1}`).avif" type="image/avif" />
          <img :src="picture(`capabilities/c${i + 1}`).jpg" alt="" decoding="async" />
        </picture>
        <span class="caps__counter">{{ String(shown + 1).padStart(2, "0") }} / 06</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import AccentText from "./AccentText.vue";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { picture } from "../lib/media";
import { useInView } from "../lib/useInView";
import { vReveal } from "../lib/motion";

const { t, tm, rt } = useI18n();
const root = ref<HTMLElement | null>(null);
const seen = useInView(root, "-15%");

// vue-i18n types message arrays loosely; each field is a compiled message resolved by rt().
type Msg = Parameters<typeof rt>[0];
const items = computed(() =>
  (tm("capabilities.items") as { title: Msg; body: Msg }[]).map((it) => ({ title: rt(it.title), body: rt(it.body) })),
);

const active = ref<number | null>(null);
// the still keeps showing the last active row, so it never flashes empty between rows
const lastActive = ref(0);
const shown = computed(() => active.value ?? lastActive.value);
const rows = ref<(HTMLElement | null)[]>([]);

// On every device the row crossing the middle band of the screen opens, so scrolling walks through all six.
let io: IntersectionObserver | null = null;
onMounted(() => {
  if (typeof IntersectionObserver === "undefined") return;
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) active.value = Number((e.target as HTMLElement).dataset.index);
      }
    },
    { rootMargin: "-45% 0px -45% 0px" },
  );
  rows.value.forEach((r) => r && io?.observe(r));
});
onBeforeUnmount(() => io?.disconnect());

watch(active, (v) => {
  if (v !== null) lastActive.value = v;
});
</script>

<style scoped>
.caps {
  background: var(--ajm-caps);
  color: var(--ajm-on-stage);
  padding: clamp(96px, 14vw, 180px) var(--ajm-gutter);
}
.caps__head {
  margin-bottom: clamp(48px, 7vw, 96px);
}
.caps__eyebrow {
  color: rgba(244, 241, 234, 0.55);
  margin: 0 0 18px;
}
.caps__title {
  margin: 0;
  font: 500 clamp(40px, 6.4vw, 100px) / 0.98 var(--ajm-font);
  letter-spacing: -0.025em;
}
.caps__body {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: clamp(32px, 5vw, 80px);
  align-items: start;
}
.caps__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid rgba(244, 241, 234, 0.16);
}
.cap {
  display: grid;
  grid-template-columns: clamp(72px, 10vw, 150px) 1fr;
  gap: 16px;
  align-items: baseline;
  /* tall enough that each row holds the middle of the screen for a moment while scrolling */
  min-height: clamp(120px, 22vh, 220px);
  align-content: start;
  padding: clamp(18px, 2.4vw, 30px) 0;
  border-bottom: 1px solid rgba(244, 241, 234, 0.16);
  cursor: default;
  outline: none;
  transition: opacity 0.45s ease;
}
.has-active .cap:not(.on) {
  opacity: 0.35;
}
.cap:focus-visible {
  box-shadow: inset 2px 0 0 var(--ajm-on-stage);
}
/* plain, light numerals (round 8: the outlined ones showed the font's inner contours) */
.cap__num {
  font: 200 clamp(40px, 6vw, 92px) / 0.9 var(--ajm-font);
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  color: rgba(244, 241, 234, 0.4);
  transition: color 0.45s ease;
}
.cap.on .cap__num {
  color: var(--ajm-on-stage);
}
.cap__text {
  display: grid;
  gap: 8px;
}
.cap__title {
  font: 500 clamp(20px, 2.2vw, 30px) / 1.15 var(--ajm-font);
  letter-spacing: -0.01em;
  transition: transform 0.5s var(--ajm-ease);
}
.cap.on .cap__title {
  transform: translateX(10px);
}
.cap__desc {
  max-width: 520px;
  font-size: 16px;
  color: rgba(244, 241, 234, 0.66);
  /* accordion: only the open row shows its text */
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transform: translateY(-6px);
  transition:
    max-height 0.6s var(--ajm-ease),
    opacity 0.5s ease,
    transform 0.6s var(--ajm-ease);
}
.cap.on .cap__desc,
.caps__list:not(.has-active) .cap__desc {
  max-height: 10em;
  opacity: 1;
  transform: none;
}
.caps__stage {
  position: sticky;
  top: 12vh;
  aspect-ratio: 4 / 5;
  overflow: hidden;
  background: #151412;
}
.caps__still,
.caps__still img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.caps__still {
  clip-path: inset(0 0 100% 0);
  transition: clip-path 0.9s var(--ajm-ease);
}
.caps__still img {
  transform: scale(1.12);
  transition: transform 1.4s var(--ajm-ease);
}
.caps__still.on {
  clip-path: inset(0 0 0 0);
  z-index: 1;
}
.caps__still.on img {
  transform: scale(1);
}
.caps__counter {
  position: absolute;
  z-index: 2;
  left: 16px;
  bottom: 14px;
  font: 500 11px var(--ajm-font);
  letter-spacing: 0.16em;
  color: var(--ajm-on-stage);
  mix-blend-mode: difference;
}
@media (max-width: 860px) {
  .caps__body {
    grid-template-columns: 1fr;
  }
  .caps__stage {
    grid-row: 1;
    position: sticky;
    top: 64px;
    z-index: 1;
    aspect-ratio: 16 / 9;
  }
}
</style>
