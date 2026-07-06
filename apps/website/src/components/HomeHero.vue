import { useI18n } from "vue-i18n";
import { useReveal } from "@shared/composables/useReveal";
import { heroConfig as config } from "../config/websiteContent";

const { t } = useI18n();
</script>

<style lang="scss" scoped>
$bp-desktop: 960px;
$bp-mobile:  600px;
$ease-out:   cubic-bezier(0.25, 0.46, 0.45, 0.94);
$ease-sharp: cubic-bezier(0.16, 1, 0.3, 1);

/* ── Keyframes ────────────────────────────────────────────────────────────── */

@keyframes hero-wipe {
  from { clip-path: inset(0 100% 0 0); }
  to   { clip-path: inset(0 0%   0 0); }
}

@keyframes hero-bar-draw {
  from { width: 0;       opacity: 0; }
  to   { width: 2.75rem; opacity: 1; }
}

@keyframes hero-rise {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0);    }
}

@keyframes hero-img-in {
  0%   { opacity: 0; transform: scale(1.04); filter: blur(8px) saturate(0.3); }
  55%  { opacity: 0.8; }
  100% { opacity: 1; transform: scale(1);    filter: blur(0)   saturate(1);   }
}

@keyframes hero-img-in-dark {
  0%   { opacity: 0; transform: scale(1.04); filter: blur(8px) saturate(0.3) brightness(0.85); }
  55%  { opacity: 0.8; }
  100% { opacity: 1; transform: scale(1);    filter: blur(0)   saturate(0.9) brightness(0.85); }
}

@keyframes hero-scan-line {
  0%   { top: -2px; opacity: 0.65; }
  80%  { top: 100%; opacity: 0.12; }
  100% { top: 100%; opacity: 0;    }
}

/* ── Layout ───────────────────────────────────────────────────────────────── */
.home-hero {
  width: calc(100% - 2 * var(--website-page-gutter));
  max-width: var(--website-page-max-width);
  margin: 0 auto 2rem;
  border-radius: var(--website-card-radius);
  overflow: hidden;
  position: relative;

  @media (max-width: $bp-mobile) {
    width: calc(100% - 2 * var(--website-page-gutter-mobile));
    margin: 0 auto 1.5rem;
    border-radius: 14px 14px 0 0;
    border-bottom: 1px solid var(--website-border);
  }
}

.home-hero__inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  align-items: center;
  padding: 3rem 2.5rem 4rem;
  position: relative;
  z-index: 1;

  @media (min-width: #{$bp-desktop + 1px}) {
    min-height: calc(100vh - var(--website-header-height));
  }

  @media (max-width: $bp-desktop) {
    grid-template-columns: 1fr;
    text-align: center;
    padding: 2rem 2rem 3rem;
    gap: 1.75rem;
  }

  @media (max-width: $bp-mobile) {
    padding: 1.75rem 1.5rem 2.5rem;
    gap: 1.25rem;
  }
}

/* ── Title ────────────────────────────────────────────────────────────────── */
.home-hero__title {
  font-size: clamp(2rem, 4.5vw, 2.875rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.03em;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.06em;
}

.home-hero__title-wrap {
  overflow: hidden;
  display: block;
}

.home-hero__title-line1 {
  display: block;
  color: var(--website-text);
  animation: hero-wipe 1.6s ease-in-out 0.2s both;
}

.home-hero__title-line2 {
  display: block;
  color: var(--website-primary);
  animation: hero-wipe 1.6s ease-in-out 0.55s both;
}

/* ── Accent bar ───────────────────────────────────────────────────────────── */
.home-hero__accent {
  height: 2px;
  background: var(--website-primary);
  border-radius: 2px;
  margin: 1.1rem 0 1.25rem;
  width: 0;
  opacity: 0;
  animation: hero-bar-draw 0.5s $ease-out 1.35s forwards;

  @media (max-width: $bp-desktop) {
    margin-left: auto;
    margin-right: auto;
  }
}

/* ── Subtitle ─────────────────────────────────────────────────────────────── */
.home-hero__subtitle {
  font-size: 1.0625rem;
  line-height: 1.65;
  color: var(--website-text-secondary);
  margin: 0 0 2rem;
  opacity: 0;
  animation: hero-rise 0.6s $ease-out 1.55s forwards;
}

/* ── CTAs ─────────────────────────────────────────────────────────────────── */
.home-hero__ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.875rem;
  opacity: 0;
  animation: hero-rise 0.55s $ease-out 1.75s forwards;

  @media (max-width: $bp-desktop) {
    justify-content: center;
  }
}

/* ── Media ────────────────────────────────────────────────────────────────── */
.home-hero__media {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 440px;
  overflow: hidden;
  border-radius: 14px;

  @media (max-width: $bp-desktop) {
    order: -1;
    max-height: 260px;
    aspect-ratio: 16 / 9;
    border-radius: 10px;
  }

  @media (max-width: $bp-mobile) {
    margin-left: -1.5rem;
    margin-right: -1.5rem;
    width: calc(100% + 3rem);
    max-height: none;
    aspect-ratio: 4 / 3;
    max-height: 440px;
    overflow: hidden;
    border-radius: 14px;
    /* Skeleton shown while LCP image loads */
    background: linear-gradient(
      135deg,
      var(--website-skeleton-base)      0%,
      var(--website-skeleton-highlight) 50%,
      var(--website-skeleton-base)      100%
    );
  }

.home-hero__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  border-radius: inherit;
  z-index: 1;
  animation: hero-img-in 1.1s $ease-sharp 0.1s both;

  .home-hero--visible .home-hero__img {
    animation: hero-img-in 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;

    [data-theme="dark"] & {
      animation-name: hero-img-in-dark;
    }
  }

  @keyframes hero-img-in {
    0%   { opacity: 0;   filter: blur(8px) saturate(0.5); transform: scale(1.02); }
    40%  { opacity: 0.8; }
    100% { opacity: 1;   filter: blur(0) saturate(1); transform: scale(1); }
  }

  @keyframes hero-img-in-dark {
    0%   { opacity: 0;   filter: blur(8px) saturate(0.5) brightness(0.88) contrast(1.05); transform: scale(1.02); }
    40%  { opacity: 0.8; }
    100% { opacity: 1;   filter: blur(0) saturate(0.92) brightness(0.88) contrast(1.05); transform: scale(1); }
  }
}

.home-hero__scan-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(18, 143, 131, 0.7) 30%,
    rgba(142, 214, 206, 0.9) 50%,
    rgba(18, 143, 131, 0.7) 70%,
    transparent 100%
  );
  z-index: 2;
  animation: hero-scan-line 1.2s $ease-out 0.35s forwards;
  pointer-events: none;
}
</style>
