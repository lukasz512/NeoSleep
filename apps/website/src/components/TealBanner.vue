<template>
  <component :is="tag" class="tb" :class="[`tb--${variant}`, { 'tb--photo': !!imageSrc }]">
    <img v-if="imageSrc" :src="imageSrc" alt="" class="tb__photo" :class="{ 'tb__photo--loaded': photoLoaded }" :style="imagePosition ? { objectPosition: imagePosition } : {}" aria-hidden="true" @load="photoLoaded = true" />
    <div class="tb__wash" aria-hidden="true" />
    <div class="tb__inner" :class="{ 'page-container': variant === 'hero' }">
      <p v-if="eyebrowKey" class="tb__eyebrow">{{ t(eyebrowKey) }}</p>
      <component :is="headingTag" class="tb__heading">
        <span class="tb__l1">{{ t(line1Key) }}</span>
        <span v-if="line2Key" class="tb__l2">{{ t(line2Key) }}</span>
      </component>
      <p class="tb__sub">{{ t(subtitleKey) }}</p>
      <div class="tb__ctas">
        <slot name="ctas" />
      </div>
    </div>
  </component>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
const photoLoaded = ref(false);
import { useI18n } from "vue-i18n";

interface Props {
  eyebrowKey?: string;
  line1Key: string;
  line2Key?: string;
  subtitleKey: string;
  imageSrc?: string;
  imagePosition?: string;
  variant?: "hero" | "cta";
}

const props = withDefaults(defineProps<Props>(), { variant: "hero" });
const { t } = useI18n();

const tag = computed(() => (props.variant === "hero" ? "section" : "div"));
const headingTag = computed(() => (props.variant === "hero" ? "h1" : "h2"));
</script>

<style lang="scss">
@layer components {
  // ── shell ──────────────────────────────────────────────────────────────────
  .tb {
    position: relative;
    overflow: hidden;
    background: linear-gradient(135deg, var(--neosleep-very-dark-teal) 0%, var(--neosleep-darker-teal) 100%);
  }

  // ── photo + color wash ─────────────────────────────────────────────────────
  .tb__photo {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 30%;
    z-index: 0;
    border-radius: inherit;
    opacity: 0;
    transition: opacity 0.6s ease;

    &--loaded {
      opacity: 1;
    }
  }

  .tb__wash {
    display: none;
    position: absolute;
    inset: 0;
    background: #0c6659;
    opacity: 0.72;
    z-index: 1;
    border-radius: inherit;

    .tb--photo & {
      display: block;
    }
  }

  // ── decorative glow circles (without photo only) ───────────────────────────
  .tb:not(.tb--photo) {
    &::before {
      content: "";
      position: absolute;
      width: 700px;
      height: 700px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(142, 214, 206, 0.14) 0%, transparent 65%);
      top: -260px;
      right: -140px;
      pointer-events: none;
      z-index: 0;
    }

    &::after {
      content: "";
      position: absolute;
      width: 500px;
      height: 500px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(142, 214, 206, 0.09) 0%, transparent 65%);
      bottom: -200px;
      left: 0;
      pointer-events: none;
      z-index: 0;
    }
  }

  // ── inner ──────────────────────────────────────────────────────────────────
  .tb__inner {
    position: relative;
    z-index: 2;
    text-align: center;
  }

  // ── hero variant ───────────────────────────────────────────────────────────
  .tb--hero {
    min-height: 480px;
    display: flex;
    align-items: center;

    .tb__inner {
      width: 100%;
      padding-top: 6rem;
      padding-bottom: 5.5rem;
    }
  }

  // ── cta variant ────────────────────────────────────────────────────────────
  .tb--cta {
    border-radius: var(--website-card-radius);
    padding: 4rem 2.5rem;
  }

  // ── typography ─────────────────────────────────────────────────────────────
  .tb__eyebrow {
    font-size: 0.8125rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--neosleep-light-teal);
    margin: 0 0 1.25rem;
  }

  .tb__heading {
    margin: 0 auto 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.06em;

    .tb--hero & {
      font-size: clamp(2.5rem, 6vw, 4rem);
      font-weight: 700;
      line-height: 1.12;
      letter-spacing: -0.03em;
      max-width: 820px;
    }

    .tb--cta & {
      font-size: clamp(1.75rem, 4vw, 2.25rem);
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.025em;
      max-width: 700px;
    }
  }

  .tb__l1 {
    color: #fff;
  }

  .tb__l2 {
    color: var(--neosleep-light-teal);
  }

  .tb__sub {
    margin: 0 auto 2.5rem;
    max-width: 580px;
    line-height: 1.65;
    color: rgba(255, 255, 255, 0.75);

    .tb--hero & {
      font-size: clamp(1rem, 2vw, 1.125rem);
      max-width: 620px;
    }

    .tb--cta & {
      font-size: 1.0625rem;
    }
  }

  .tb__ctas {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.875rem;
  }
}
</style>
