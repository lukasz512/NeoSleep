<!-- Section 07 · Sobre AJ Management. Three places set as large type; a hairline draws through them
     from left to right, the "one central point of coordination" made visible. -->
<template>
  <section id="nosotros" ref="root" class="about" :class="{ 'is-in': seen }">
    <p class="eyebrow">{{ t("about.eyebrow") }}</p>
    <h2 class="about__title">
      <span class="mask-line"><span>{{ t("about.title1") }}</span></span>
      <span class="mask-line"><span>{{ t("about.title2") }}</span></span>
    </h2>
    <div class="about__text">
      <p v-reveal>{{ t("about.body1") }}</p>
      <p v-reveal="{ delay: 100 }">{{ t("about.body2") }}</p>
    </div>

    <div class="cities">
      <div v-reveal="'line'" class="cities__line" aria-hidden="true" />
      <div v-for="(c, i) in cities" :key="c.city" v-reveal="{ delay: 250 + i * 160 }" class="city">
        <span class="city__dot" aria-hidden="true" />
        <span class="city__name">{{ c.city }}</span>
        <span class="city__role">{{ c.role }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useInView } from "../lib/useInView";
import { vReveal } from "../lib/motion";

const { t, tm, rt } = useI18n();
const root = ref<HTMLElement | null>(null);
const seen = useInView(root, "-15%");

type Msg = Parameters<typeof rt>[0];
const cities = computed(() =>
  (tm("about.cities") as { city: Msg; role: Msg }[]).map((c) => ({ city: rt(c.city), role: rt(c.role) })),
);
</script>

<style scoped>
.about {
  padding: clamp(96px, 14vw, 180px) var(--ajm-gutter);
  border-top: 1px solid var(--ajm-line);
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: clamp(24px, 4vw, 56px);
}
.about > .eyebrow {
  grid-column: 1 / -1;
  margin: 0;
}
.about__title {
  grid-column: 1 / -1;
  margin: 0;
  font: 500 clamp(40px, 6.6vw, 104px) / 0.98 var(--ajm-font);
  letter-spacing: -0.025em;
}
.about__text {
  grid-column: 6 / -1;
  display: grid;
  gap: 16px;
  font-size: clamp(17px, 1.5vw, 21px);
  color: var(--ajm-ink-soft);
}
.about__text p {
  margin: 0;
}
.cities {
  grid-column: 1 / -1;
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  padding-top: 40px;
  margin-top: clamp(24px, 4vw, 56px);
}
.cities__line {
  position: absolute;
  top: 5px;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--ajm-ink);
}
.city {
  position: relative;
  display: grid;
  gap: 10px;
}
.city__dot {
  position: absolute;
  top: -40px;
  left: 0;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--ajm-ink);
}
.city__name {
  font: 500 clamp(26px, 3.4vw, 52px) / 1 var(--ajm-font);
  letter-spacing: -0.02em;
}
.city__role {
  font: 500 12px var(--ajm-font);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ajm-muted);
}
@media (max-width: 800px) {
  .about__text {
    grid-column: 1 / -1;
  }
  .cities {
    grid-template-columns: 1fr;
    padding: 0 0 0 32px;
    gap: 36px;
  }
  .cities__line {
    top: 0;
    bottom: 0;
    left: 5px;
    right: auto;
    width: 1px;
    height: auto;
    transform-origin: top;
  }
  .cities__line.rv:not(.rv-in) {
    transform: scaleY(0);
  }
  .city__dot {
    top: 8px;
    left: -32px;
  }
}
</style>
