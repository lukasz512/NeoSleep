<template>
  <main class="julio">
    <section class="julio-hero">
      <div class="page-container julio-hero__grid">
        <div class="julio-hero__copy">
          <div class="julio-lang" role="group" aria-label="Language">
            <button
              v-for="l in langs"
              :key="l"
              type="button"
              class="julio-lang__btn"
              :class="{ 'julio-lang__btn--on': lang === l }"
              :aria-pressed="lang === l"
              @click="lang = l"
            >
              {{ l.toUpperCase() }}
            </button>
          </div>
          <p class="home-eyebrow">{{ c.doc }}</p>
          <h1 class="julio-h1">{{ c.h1 }}</h1>
          <p class="home-sub">{{ c.lead }}</p>
          <ul class="julio-meta">
            <li v-for="m in c.meta" :key="m">{{ m }}</li>
          </ul>
        </div>
        <JulioHero3D :lang="lang" :title="c.order.title" :steps="c.order.steps" fallback-src="/images/julio/shot-order.jpg" />
      </div>
      <p class="page-container julio-caption">{{ c.order.caption }}</p>
    </section>

    <section class="home-section">
      <div class="page-container">
        <h2 class="home-heading">{{ c.roadmap.title }}</h2>
        <p class="home-sub">{{ c.roadmap.lead }}</p>
        <div class="julio-grid julio-grid--phases">
          <article v-for="p in c.roadmap.phases" :key="p.title" class="julio-card" :class="{ 'julio-card--later': p.later }">
            <p class="julio-when">{{ p.when }}</p>
            <h3 class="julio-h3">{{ p.title }}</h3>
            <ul class="julio-list">
              <li v-for="i in p.items" :key="i">{{ i }}</li>
            </ul>
          </article>
        </div>
      </div>
    </section>

    <section class="home-section julio-alt">
      <div class="page-container">
        <h2 class="home-heading">{{ c.modules.title }}</h2>
        <p class="home-sub">{{ c.modules.lead }}</p>
        <div class="julio-showcase">
          <article v-for="s in c.modules.showcase" :key="s.name" class="julio-show">
            <img v-if="s.image" class="julio-show__img" :src="`/images/julio/${s.image}.jpg`" :alt="s.name" loading="lazy" />
            <div class="julio-show__body">
              <h3 class="julio-h3">{{ s.name }}</h3>
              <p>{{ s.text }}</p>
              <ul class="julio-list">
                <li v-for="b in s.bullets" :key="b">{{ b }}</li>
              </ul>
            </div>
          </article>
        </div>
        <div class="julio-grid">
          <article v-for="m in c.modules.list" :key="m.name" class="julio-card">
            <span class="julio-pill" :class="`julio-pill--${m.status}`">{{ c.modules.status[m.status] }}</span>
            <h3 class="julio-h3">{{ m.name }}</h3>
            <p>{{ m.text }}</p>
            <p v-if="m.evidence" class="julio-evidence">{{ m.evidence }}</p>
          </article>
        </div>
      </div>
    </section>

    <section v-for="blk in blocks" :key="blk.key" class="home-section">
      <div class="page-container">
        <h2 class="home-heading">{{ blk.title }}</h2>
        <p class="home-sub">{{ blk.lead }}</p>
        <div class="julio-grid">
          <article v-for="i in blk.items" :key="i.name" class="julio-card">
            <h3 class="julio-h3">{{ i.name }}</h3>
            <p>{{ i.text }}</p>
            <p v-if="i.evidence" class="julio-evidence">{{ i.evidence }}</p>
          </article>
        </div>
      </div>
    </section>

    <section class="home-section julio-alt">
      <div class="page-container">
        <h2 class="home-heading">{{ c.compliance.title }}</h2>
        <p class="home-sub">{{ c.compliance.lead }}</p>
        <div class="julio-grid julio-grid--two">
          <article class="julio-card">
            <h3 class="julio-h3">{{ c.compliance.nowLabel }}</h3>
            <ul class="julio-list">
              <li v-for="i in c.compliance.now" :key="i">{{ i }}</li>
            </ul>
          </article>
          <article class="julio-card">
            <h3 class="julio-h3">{{ c.compliance.nextLabel }}</h3>
            <ul class="julio-list">
              <li v-for="i in c.compliance.next" :key="i">{{ i }}</li>
            </ul>
          </article>
        </div>
        <p class="julio-evidence julio-dpa">{{ c.compliance.dpa }}</p>
      </div>
    </section>

    <section class="home-section">
      <div class="page-container">
        <h2 class="home-heading">{{ c.next.title }}</h2>
        <ol class="julio-next">
          <li v-for="i in c.next.items" :key="i">{{ i }}</li>
        </ol>
        <p class="julio-foot">{{ c.foot }}</p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useHead } from "@unhead/vue";
import JulioHero3D from "../components/JulioHero3D.vue";
import { julioContent } from "../config/julioContent";
import type { JulioItem, JulioLang } from "../config/julioContent";

const langs: JulioLang[] = ["es", "en"];
const lang = ref<JulioLang>("es");
const c = computed(() => julioContent[lang.value]);

interface Block {
  key: string;
  title: string;
  lead: string;
  items: JulioItem[];
}
const blocks = computed<Block[]>(() => [
  { key: "security", ...c.value.security },
  { key: "tenancy", ...c.value.tenancy },
  { key: "billing", ...c.value.billing },
]);

// Private proposal: reachable by link only, kept out of search and the nav.
useHead({
  title: computed(() => c.value.doc),
  meta: [{ name: "robots", content: "noindex,nofollow" }],
});
</script>

<style scoped>
.julio {
  color: var(--website-text);
  background: var(--website-bg);
  font-family: var(--website-font-sans);
  overflow-x: hidden;
}
.julio-hero {
  padding: 3rem 0 2rem;
  background: linear-gradient(180deg, var(--website-surface-container, #f3f7f6) 0%, var(--website-bg) 100%);
}
.julio-hero__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 2rem;
  align-items: center;
}
.julio-h1 {
  font-size: clamp(2rem, 4.2vw, 3.2rem);
  line-height: 1.1;
  margin: 0.5rem 0 1rem;
  text-wrap: balance;
}
.julio-lang {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 1rem;
  padding: 3px;
  border: 1px solid var(--website-border);
  border-radius: 999px;
}
.julio-lang__btn {
  border: 0;
  background: transparent;
  color: var(--website-text-secondary);
  font: inherit;
  font-weight: 600;
  padding: 4px 14px;
  border-radius: 999px;
  cursor: pointer;
}
.julio-lang__btn--on {
  background: var(--website-primary);
  color: #fff;
}
.julio-meta {
  list-style: none;
  padding: 0;
  margin: 1.25rem 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.julio-meta li {
  font-size: 0.85rem;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--website-icon-bg);
  color: var(--website-primary-hover);
}
.julio-caption {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: var(--website-text-secondary);
}
.julio-alt {
  background: var(--website-surface-container, #f3f7f6);
}
.julio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 1rem;
  margin-top: 2rem;
}
.julio-grid--two {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
}
.julio-card {
  min-width: 0;
  padding: 1.25rem;
  background: var(--website-bg);
  border: 1px solid var(--website-border);
  border-radius: var(--website-card-radius);
  box-shadow: var(--website-shadow-sm);
}
.julio-card--later {
  border-style: dashed;
}
.julio-h3 {
  font-size: 1.1rem;
  margin: 0.25rem 0 0.5rem;
}
.julio-when {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--website-primary);
}
.julio-list {
  padding-left: 1.1rem;
  margin: 0.5rem 0 0;
}
.julio-list li {
  margin: 0.25rem 0;
}
.julio-evidence {
  margin-top: 0.75rem;
  font-size: 0.82rem;
  color: var(--website-text-secondary);
}
.julio-dpa {
  margin-top: 1.5rem;
}
.julio-pill {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--website-icon-bg);
  color: var(--website-primary-hover);
}
.julio-pill--build {
  background: #fff3d6;
  color: #7a5200;
}
.julio-pill--plan {
  background: #e8eaee;
  color: #444a55;
}
.julio-showcase {
  display: grid;
  gap: 1.5rem;
  margin-top: 2rem;
}
.julio-show {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 1.5rem;
  align-items: center;
}
.julio-show:nth-child(even) .julio-show__img {
  order: 2;
}
.julio-show__img {
  width: 100%;
  height: auto;
  border-radius: var(--website-card-radius);
  box-shadow: var(--website-shadow-md);
}
.julio-show__body {
  min-width: 0;
}
.julio-next {
  margin-top: 1.5rem;
  padding-left: 1.25rem;
}
.julio-next li {
  margin: 0.5rem 0;
}
.julio-foot {
  margin-top: 2rem;
  font-size: 0.85rem;
  color: var(--website-text-secondary);
}
@media (max-width: 800px) {
  .julio-hero__grid,
  .julio-show {
    grid-template-columns: minmax(0, 1fr);
  }
  .julio-show:nth-child(even) .julio-show__img {
    order: 0;
  }
}
</style>
