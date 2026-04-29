<template>
  <section
    id="solutions"
    ref="sectionRef"
    class="home-section home-solutions home-reveal"
    :class="{ 'home-reveal--visible': visible }"
  >
    <div class="page-container">
      <p class="home-eyebrow">{{ t("website.solutions.title") }}</p>
      <h2 class="home-heading">{{ t("website.solutions.heading") }}</h2>
      <p class="home-sub home-sub--center">{{ t("website.solutions.subtitle") }}</p>
      <div class="hsl-cards">
        <div
          v-for="card in solutionCards"
          :key="card.id"
          :ref="(el) => captureCard(card, el as HTMLElement | null)"
          class="hsl-card"
        >
          <IconBox :card-icon="true">
            <component :is="card.icon" />
          </IconBox>
          <div class="hsl-card__body">
            <h3 class="hsl-card__title">{{ t(card.titleKey) }}</h3>
            <p class="hsl-card__desc">{{ t(card.descKey) }}</p>
            <ul class="hsl-checklist">
            <li v-for="bk in card.bulletKeys" :key="bk">
              <span class="hsl-check" aria-hidden="true" />
              <span>{{ t(bk) }}</span>
            </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="hsl-mobile-cta">
        <RouterLink :to="solutionsCtaTo" class="home-btn home-btn--primary">
          {{ t("website.solutions.cta") }}
          <span class="home-btn__arrow" aria-hidden="true">→</span>
        </RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { IconBox } from "./icons";
import { useReveal } from "@shared/composables/useReveal";
import { solutionCards, solutionsCtaTo, type SolutionCard } from "../config/websiteContent";

const { t } = useI18n();
const sectionRef = ref<HTMLElement | null>(null);
const visible    = useReveal(sectionRef, 0.12);
let cleanups: (() => void)[] = [];

function captureCard(card: SolutionCard, el: HTMLElement | null) {
  if (!el) return;
  if (card.animId === "heartbeat") setupHeartbeat(el);
  setupClock(el);
}

function setupHeartbeat(el: HTMLElement) {
  const line = el.querySelector<HTMLElement>(".view-home__icon-heartbeat-line");
  const run  = () => el.classList.add("view-home__therapy-card--draw");
  const onEnd = () => el.classList.remove("view-home__therapy-card--draw");
  line?.addEventListener("animationend", onEnd);
  el.addEventListener("mouseenter", run);
  const obs = new IntersectionObserver(
    ([e]) => { if (e?.isIntersecting) { run(); obs.disconnect(); } },
    { threshold: 0.25 }
  );
  obs.observe(el);
  cleanups.push(() => {
    line?.removeEventListener("animationend", onEnd);
    el.removeEventListener("mouseenter", run);
    obs.disconnect();
  });
}

function setupClock(el: HTMLElement) {
  const hand = el.querySelector<HTMLElement>(".view-home__icon-clock-min-hand");
  if (!hand) return;
  const onEnd = (e: AnimationEvent) => {
    if (e.target !== hand) return;
    el.classList.remove("view-home__clock-rotating");
    el.classList.add("view-home__clock-done");
  };
  const onEnter = () => {
    el.classList.remove("view-home__clock-done", "view-home__clock-rotating");
    requestAnimationFrame(() => el.classList.add("view-home__clock-rotating"));
  };
  hand.addEventListener("animationend", onEnd);
  el.addEventListener("mouseenter", onEnter);
  cleanups.push(() => {
    hand.removeEventListener("animationend", onEnd);
    el.removeEventListener("mouseenter", onEnter);
  });
}

onUnmounted(() => cleanups.forEach((fn) => fn()));
</script>

<style lang="scss">
@layer components {
  .home-solutions {
    background: rgba(142, 214, 206, 0.1);
    [data-theme="dark"] & { background: rgba(18, 143, 131, 0.07); }
  }

  .hsl-cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
    margin-bottom: 2rem;
    max-width: 900px;
    margin-left: auto;
    margin-right: auto;
  }

  .hsl-card {
    background: var(--website-bg);
    border: 1px solid var(--website-border);
    border-radius: var(--website-radius);
    padding: 1.75rem;
    box-shadow: var(--website-shadow-sm);
    position: relative;
    overflow: visible;
  }

  .hsl-card__body {
    flex: 1;
    min-width: 0;
    width: 100%;
  }

  .hsl-card__title {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--website-text);
    margin: 1rem 0 0.5rem;
  }

  .hsl-card__desc {
    font-size: 0.9375rem;
    line-height: 1.55;
    color: var(--website-text-secondary);
    margin: 0 0 1rem;
  }

  .hsl-checklist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    li {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9375rem;
      color: var(--website-text-secondary);
      line-height: 1.5;
    }
  }

  .hsl-check {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(18, 143, 131, 0.18);
    display: inline-flex;
    align-items: center;
    justify-content: center;

    &::after {
      content: "✓";
      color: var(--website-primary);
      font-size: 0.7rem;
      font-weight: 700;
    }
  }

  .hsl-mobile-cta {
    display: none;
    justify-content: center;
    margin-top: 0.5rem;
  }
}
</style>
