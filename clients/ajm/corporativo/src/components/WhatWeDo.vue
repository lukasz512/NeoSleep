<!-- Section 02: type only. Signature move: the six words light up one by one as the section scrolls. -->
<template>
  <section ref="root" class="what" :class="{ 'is-in': seen }">
    <h2 class="what__title">
      <span class="mask-line"><span><AccentText :text="t('what.title1')" /></span></span>
      <span class="mask-line"><span><AccentText :text="t('what.title2')" /></span></span>
    </h2>
    <div class="what__text">
      <p>{{ t("what.body1") }}</p>
      <p>{{ t("what.body2") }}</p>
    </div>
    <ul ref="list" class="what__words">
      <li v-for="(word, i) in words" :key="word" :class="{ lit: i < litCount }">{{ word }}</li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import AccentText from "./AccentText.vue";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useInView } from "../lib/useInView";
import { span01, useScrollProgress } from "../lib/motion";

const props = defineProps<{ lite: boolean }>();
const { t, tm, rt } = useI18n();
const root = ref<HTMLElement | null>(null);
const seen = useInView(root, "-15%");

// vue-i18n types message arrays loosely; each entry is a compiled message resolved by rt().
const words = computed(() => (tm("what.words") as unknown[]).map((w) => rt(w as Parameters<typeof rt>[0])));

// Words light up only once the list itself is on screen: the first when it passes 80 % of the
// viewport, the last when it reaches 40 %, so every word is seen lighting up (lite: all lit).
const list = ref<HTMLElement | null>(null);
const entering = useScrollProgress(list, "enter");
const litCount = computed(() =>
  props.lite ? words.value.length : Math.floor(span01(entering.value, 0.2, 0.6) * words.value.length + 0.001),
);
</script>

<style scoped>
.what {
  padding: clamp(96px, 16vw, 200px) var(--ajm-gutter);
  display: grid;
  gap: clamp(32px, 5vw, 64px);
  grid-template-columns: repeat(12, minmax(0, 1fr));
}
.what__title {
  grid-column: 1 / -1;
  margin: 0;
  font: 500 clamp(40px, 7vw, 112px) / 0.98 var(--ajm-font);
  letter-spacing: -0.025em;
  /* tight letters, but the words keep air between them (round 8) */
  word-spacing: 0.12em;
}
.what__text {
  grid-column: 6 / -1;
  display: grid;
  gap: 16px;
  font-size: clamp(17px, 1.5vw, 21px);
  color: var(--ajm-ink-soft);
}
.what__text p {
  margin: 0;
}
.what__words {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 0;
  margin: 0;
  padding: 24px 0 0;
  list-style: none;
  border-top: 1px solid var(--ajm-line);
  font: 500 clamp(22px, 3.2vw, 44px) / 1.2 var(--ajm-font);
  letter-spacing: -0.01em;
}
.what__words li {
  color: var(--ajm-faint);
  transition: color 0.5s ease;
}
.what__words li:not(:last-child)::after {
  content: " / ";
  color: var(--ajm-faint);
  white-space: pre;
}
.what__words li.lit {
  color: var(--ajm-ink);
}
@media (max-width: 800px) {
  .what__text {
    grid-column: 1 / -1;
  }
}
</style>
