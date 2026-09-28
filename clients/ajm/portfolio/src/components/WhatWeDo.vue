<!-- Section 02: type only. Signature move: the six words light up one by one as the section scrolls. -->
<template>
  <section ref="root" class="what" :class="{ 'is-in': seen }">
    <h2 class="what__title">
      <span class="mask-line"><span>{{ t("what.title1") }}</span></span>
      <span class="mask-line"><span><AccentText :text="t('what.title2')" /></span></span>
    </h2>
    <div class="what__text">
      <p>{{ t("what.body1") }}</p>
      <p>{{ t("what.body2") }}</p>
    </div>
    <ul class="what__words">
      <li v-for="(word, i) in words" :key="word" :class="{ lit: i < litCount }">{{ word }}</li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import AccentText from "./AccentText.vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useInView } from "../lib/useInView";

const props = defineProps<{ lite: boolean }>();
const { t, tm, rt } = useI18n();
const root = ref<HTMLElement | null>(null);
const seen = useInView(root, "-15%");

// vue-i18n types message arrays loosely; each entry is a compiled message resolved by rt().
const words = computed(() => (tm("what.words") as unknown[]).map((w) => rt(w as Parameters<typeof rt>[0])));

// Words light up with scroll progress through the section; lite mode shows them all at once.
const progress = ref(0);
const litCount = computed(() => (props.lite ? words.value.length : Math.ceil(progress.value * words.value.length)));

function onScroll() {
  const el = root.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const span = rect.height + window.innerHeight * 0.3;
  progress.value = Math.min(1, Math.max(0, (window.innerHeight * 0.85 - rect.top) / span));
}
onMounted(() => {
  if (props.lite) return;
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
});
onBeforeUnmount(() => window.removeEventListener("scroll", onScroll));
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
