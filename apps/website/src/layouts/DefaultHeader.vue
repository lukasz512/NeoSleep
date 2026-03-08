<template>
  <div class="default-header-root">
    <header
      class="default-header"
      :class="{
        'default-header--dark': isDark,
        'default-header--open': mobileMenuOpen,
      }"
    >
      <div class="default-header__left">
        <button
          type="button"
          class="default-header__hamburger"
          :aria-label="mobileMenuOpen ? t('website.nav.menuClose') : t('website.nav.menuOpen')"
          :aria-expanded="mobileMenuOpen"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <span class="default-header__hamburger-bar" />
          <span class="default-header__hamburger-bar" />
          <span class="default-header__hamburger-bar" />
        </button>
        <RouterLink to="/" class="default-header__brand">
          <img
            :src="logoSrc"
            alt="NeoSleep"
            class="default-header__logo"
            width="140"
            height="32"
          />
        </RouterLink>
      </div>
      <nav class="default-header__nav default-header__nav--desktop" aria-label="Main navigation">
        <a href="/#solutions" class="default-header__nav-link">{{ t("website.nav.solutions") }}</a>
        <a href="/#for-dentists" class="default-header__nav-link">{{ t("website.nav.forDentists") }}</a>
        <a href="/#for-patients" class="default-header__nav-link">{{ t("website.nav.forPatients") }}</a>
        <RouterLink to="/about" class="default-header__nav-link" @click="closeMobileMenu">{{ t("website.nav.about") }}</RouterLink>
        <RouterLink to="/contact" class="default-header__nav-link" @click="closeMobileMenu">{{ t("website.nav.contact") }}</RouterLink>
        <a href="/#cta" class="default-header__cta">{{ t("website.header.cta") }}</a>
        <div class="default-header__nav-tools">
          <LanguageSelect />
          <ThemeToggle />
        </div>
      </nav>
      <div class="default-header__right">
        <ThemeToggle class="default-header__theme-mobile" />
      </div>
      <div class="default-header__wave" aria-hidden="true">
        <svg viewBox="0 0 1200 32" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path
            class="default-header__wave-path"
            d="M0 0h1200v32Q900 16 600 32Q300 16 0 32V0Z"
            fill="currentColor"
          />
        </svg>
      </div>
      <div
        class="default-header__shadow"
        :class="{ 'default-header__shadow--hidden': !wavesVisible }"
        aria-hidden="true"
        :style="shadowStyle"
      >
        <svg
          class="default-header__shadow-svg"
          :viewBox="`0 0 ${SHADOW_WIDTH} ${SHADOW_VIEW_HEIGHT}`"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient :id="`${uid}-shadow-back`" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" class="default-header__shadow-stop-back-top" />
              <stop offset="40%" class="default-header__shadow-stop-back-mid" />
              <stop offset="100%" class="default-header__shadow-stop-bottom" />
            </linearGradient>
            <linearGradient :id="`${uid}-shadow-front`" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" class="default-header__shadow-stop-top" />
              <stop offset="25%" class="default-header__shadow-stop-quarter" />
              <stop offset="55%" class="default-header__shadow-stop-mid" />
              <stop offset="90%" class="default-header__shadow-stop-fade" />
              <stop offset="100%" class="default-header__shadow-stop-bottom" />
            </linearGradient>
          </defs>
          <path
            :d="shadowWavePathBack"
            :fill="`url(#${uid}-shadow-back)`"
            class="default-header__wave-back"
          />
          <path
            :d="shadowWavePathFront"
            :fill="`url(#${uid}-shadow-front)`"
            class="default-header__wave-front"
          />
        </svg>
      </div>
    </header>
    <Transition name="mobile-menu">
      <div
        v-show="mobileMenuOpen"
        class="default-header__mobile-overlay"
        aria-hidden="true"
        @click="closeMobileMenu"
      />
    </Transition>
    <Transition name="mobile-menu-panel">
      <aside
        v-show="mobileMenuOpen"
        class="default-header__mobile-menu"
        aria-label="Mobile navigation"
        role="dialog"
        aria-modal="true"
      >
        <div class="default-header__mobile-menu-inner">
          <div class="default-header__mobile-menu-lang">
            <LanguageSelect />
          </div>
          <a href="/#solutions" class="default-header__mobile-link" @click="closeMobileMenu">{{ t("website.nav.solutions") }}</a>
          <a href="/#for-dentists" class="default-header__mobile-link" @click="closeMobileMenu">{{ t("website.nav.forDentists") }}</a>
          <a href="/#for-patients" class="default-header__mobile-link" @click="closeMobileMenu">{{ t("website.nav.forPatients") }}</a>
          <RouterLink to="/about" class="default-header__mobile-link" @click="closeMobileMenu">{{ t("website.nav.about") }}</RouterLink>
          <RouterLink to="/contact" class="default-header__mobile-link" @click="closeMobileMenu">{{ t("website.nav.contact") }}</RouterLink>
          <a href="/#cta" class="default-header__mobile-cta" @click="closeMobileMenu">{{ t("website.header.cta") }}</a>
        </div>
      </aside>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import ThemeToggle from "../components/ThemeToggle.vue";
import LanguageSelect from "../components/LanguageSelect.vue";
import { useTheme } from "../composables/useTheme";
import { useFloatingNav } from "../composables/useFloatingNav";

const { t } = useI18n();
const { isDark } = useTheme();
const { translateX, translateY, waveAmplitude, wavePhase, wavesVisible } = useFloatingNav();
const mobileMenuOpen = ref(false);

const uid = `default-header-${Math.random().toString(36).slice(2, 9)}`;

const logoSrc = computed(() =>
  isDark.value ? "/brand/logos/logo_dark.svg" : "/brand/logos/logo_light.svg"
);

const shadowStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px)`,
}));

const SHADOW_WIDTH = 2400;
const SHADOW_HEIGHT = 140;
const SHADOW_VIEW_HEIGHT = 200;
const WAVE_PERIODS = 2.5;
const PHASE_OFFSET = Math.PI * 0.6;

function wavePath(amplitude: number, phase: number): string {
  const points: string[] = [];
  const step = 18;
  for (let x = SHADOW_WIDTH; x >= 0; x -= step) {
    const tVal = (x / SHADOW_WIDTH) * Math.PI * 2 * WAVE_PERIODS + phase;
    const y = SHADOW_HEIGHT + amplitude * Math.sin(tVal);
    points.push(`${x},${y.toFixed(2)}`);
  }
  return `M0,0 L${SHADOW_WIDTH},0 ${points.map((p) => `L${p}`).join(" ")} L0,${SHADOW_HEIGHT} Z`;
}

const shadowWavePathBack = computed(() =>
  wavePath(waveAmplitude.value * 1.15, wavePhase.value + PHASE_OFFSET)
);
const shadowWavePathFront = computed(() =>
  wavePath(waveAmplitude.value, wavePhase.value)
);

function closeMobileMenu() {
  mobileMenuOpen.value = false;
}
</script>

<style lang="scss" scoped>
.default-header-root {
  display: contents;
}

.default-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem 0;
  padding-bottom: 1.5rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease;
  overflow: visible;
}

.default-header--dark.default-header {
  background: rgba(15, 20, 25, 0.9);
}

.default-header__shadow {
  position: absolute;
  top: calc(100% + 10px);
  left: -90%;
  width: 280%;
  height: 140px;
  pointer-events: none;
  will-change: transform;
  filter: blur(20px);
  transition: opacity 0.3s ease, visibility 0.3s ease;
}

.default-header__shadow--hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.default-header__shadow-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.default-header__shadow-stop-top {
  stop-color: rgba(18, 143, 131, 0.18);
}

.default-header__shadow-stop-quarter {
  stop-color: rgba(18, 143, 131, 0.12);
}

.default-header__shadow-stop-mid {
  stop-color: rgba(18, 143, 131, 0.06);
}

.default-header__shadow-stop-fade {
  stop-color: rgba(18, 143, 131, 0.02);
}

.default-header__shadow-stop-bottom {
  stop-color: transparent;
}

.default-header__shadow-stop-back-top {
  stop-color: rgba(18, 143, 131, 0.2);
}

.default-header__shadow-stop-back-mid {
  stop-color: rgba(18, 143, 131, 0.06);
}

.default-header--dark .default-header__shadow-stop-top {
  stop-color: rgba(18, 143, 131, 0.26);
}

.default-header--dark .default-header__shadow-stop-quarter {
  stop-color: rgba(18, 143, 131, 0.16);
}

.default-header--dark .default-header__shadow-stop-mid {
  stop-color: rgba(18, 143, 131, 0.08);
}

.default-header--dark .default-header__shadow-stop-fade {
  stop-color: rgba(18, 143, 131, 0.03);
}

.default-header--dark .default-header__shadow-stop-back-top {
  stop-color: rgba(18, 143, 131, 0.28);
}

.default-header--dark .default-header__shadow-stop-back-mid {
  stop-color: rgba(18, 143, 131, 0.1);
}

.default-header__wave-back {
  opacity: 0.9;
}

.default-header__wave-front {
  opacity: 1;
}

.default-header__wave {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 28px;
  line-height: 0;
  pointer-events: none;
  color: rgba(255, 255, 255, 0.85);
}

.default-header--dark .default-header__wave {
  color: rgba(15, 20, 25, 0.9);
}

.default-header__wave svg {
  width: 100%;
  height: 100%;
  display: block;
  vertical-align: bottom;
}

.default-header__left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.default-header__hamburger {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: var(--website-radius);
  background: transparent;
  color: var(--website-text);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;

  &:hover {
    background: rgba(18, 143, 131, 0.08);
    color: var(--website-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--website-primary);
    outline-offset: 2px;
  }
}

.default-header__hamburger-bar {
  display: block;
  width: 22px;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.default-header--open .default-header__hamburger-bar:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

.default-header--open .default-header__hamburger-bar:nth-child(2) {
  opacity: 0;
}

.default-header--open .default-header__hamburger-bar:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

.default-header__right {
  display: none;
  align-items: center;
  gap: 0.5rem;
}

.default-header__theme-mobile {
  flex-shrink: 0;
}

.default-header__brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: var(--website-text);
}

.default-header__logo {
  height: 32px;
  width: auto;
  display: block;
  flex-shrink: 0;
}

.default-header__nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.default-header__nav-tools {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.default-header__nav-link {
  color: var(--website-text);
  text-decoration: none;
  font-size: 0.9375rem;
  min-height: var(--website-btn-min-height);
  min-width: var(--website-btn-min-width);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.5rem;
  border-radius: var(--website-radius);
  transition: background-color 0.2s ease, color 0.2s ease;

  &:hover {
    color: var(--website-primary);
    background: rgba(18, 143, 131, 0.08);
  }
}

.default-header__cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--website-btn-min-height);
  padding: 0 1.25rem;
  background: var(--website-primary);
  color: #fff;
  font-weight: 600;
  font-size: 0.9375rem;
  text-decoration: none;
  border-radius: 9999px;
  transition: background-color 0.2s ease;

  &:hover {
    background: var(--website-primary-hover);
    color: #fff;
  }
}

@media (max-width: 900px) {
  .default-header__nav--desktop {
    display: none;
  }

  .default-header__hamburger {
    display: flex;
  }

  .default-header__right {
    display: flex;
    align-items: center;
  }
}

.default-header__mobile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 11;
  top: 0;
}

.default-header__mobile-menu {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: min(300px, 85vw);
  max-width: 300px;
  background: var(--website-bg);
  border-right: 1px solid var(--website-border);
  z-index: 12;
  box-shadow: var(--website-shadow-md);
  overflow: auto;
}

.default-header__mobile-menu-inner {
  display: flex;
  flex-direction: column;
  padding: 1rem 0;
  gap: 0.25rem;
}

.default-header__mobile-menu-lang {
  padding: 0 1rem 1rem;
  border-bottom: 1px solid var(--website-border);
  margin-bottom: 0.5rem;
}

.default-header__mobile-link {
  display: block;
  padding: 0.75rem 1.25rem;
  color: var(--website-text);
  text-decoration: none;
  font-size: 1rem;
  transition: background 0.2s, color 0.2s;

  &:hover {
    background: rgba(18, 143, 131, 0.08);
    color: var(--website-primary);
  }
}

.default-header__mobile-cta {
  display: block;
  margin: 1rem 1.25rem 0;
  padding: 0.75rem 1.25rem;
  text-align: center;
  background: var(--website-primary);
  color: #fff;
  font-weight: 600;
  text-decoration: none;
  border-radius: 9999px;
  transition: background 0.2s;

  &:hover {
    background: var(--website-primary-hover);
    color: #fff;
  }
}

.mobile-menu-enter-active,
.mobile-menu-leave-active {
  transition: opacity 0.25s ease;
}

.mobile-menu-enter-from,
.mobile-menu-leave-to {
  opacity: 0;
}

.mobile-menu-panel-enter-active,
.mobile-menu-panel-leave-active {
  transition: transform 0.25s ease;
}

.mobile-menu-panel-enter-from,
.mobile-menu-panel-leave-to {
  transform: translateX(-100%);
}
</style>
