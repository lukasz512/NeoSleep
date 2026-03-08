<template>
  <div class="layout-default" :class="{ 'layout-default--dark': isDark, 'layout-default--container-compact': isCompact }">
    <header class="layout-default__header" :class="{ 'layout-default__header-open': mobileMenuOpen }">
      <div class="layout-default__header-left">
        <button
          type="button"
          class="layout-default__hamburger"
          :aria-label="mobileMenuOpen ? t('website.nav.menuClose') : t('website.nav.menuOpen')"
          :aria-expanded="mobileMenuOpen"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <span class="layout-default__hamburger-bar" />
          <span class="layout-default__hamburger-bar" />
          <span class="layout-default__hamburger-bar" />
        </button>
        <RouterLink to="/" class="layout-default__brand">
          <LogoIcon class="layout-default__logo-icon" />
          <span class="layout-default__logo-text">{{ t("website.logo") }}</span>
        </RouterLink>
      </div>
      <nav class="layout-default__nav layout-default__nav--desktop" aria-label="Main navigation">
        <a href="/#solutions" class="layout-default__nav-link">{{ t("website.nav.solutions") }}</a>
        <a href="/#for-dentists" class="layout-default__nav-link">{{ t("website.nav.forDentists") }}</a>
        <a href="/#for-patients" class="layout-default__nav-link">{{ t("website.nav.forPatients") }}</a>
        <RouterLink to="/about" class="layout-default__nav-link" @click="closeMobileMenu">{{ t("website.nav.about") }}</RouterLink>
        <RouterLink to="/contact" class="layout-default__nav-link" @click="closeMobileMenu">{{ t("website.nav.contact") }}</RouterLink>
        <a href="/#cta" class="layout-default__cta">{{ t("website.header.cta") }}</a>
        <div class="layout-default__nav-tools">
          <ContainerStyleToggle />
          <LanguageSelect />
          <ThemeToggle />
        </div>
      </nav>
      <div class="layout-default__header-right">
        <ContainerStyleToggle class="layout-default__container-toggle-mobile" />
        <ThemeToggle class="layout-default__theme-mobile" />
      </div>
    </header>
    <Transition name="mobile-menu">
      <div
        v-show="mobileMenuOpen"
        class="layout-default__mobile-overlay"
        aria-hidden="true"
        @click="closeMobileMenu"
      />
    </Transition>
    <Transition name="mobile-menu-panel">
      <aside
        v-show="mobileMenuOpen"
        class="layout-default__mobile-menu"
        aria-label="Mobile navigation"
        role="dialog"
        aria-modal="true"
      >
        <div class="layout-default__mobile-menu-inner">
          <div class="layout-default__mobile-menu-lang">
            <LanguageSelect />
          </div>
          <a href="/#solutions" class="layout-default__mobile-link" @click="closeMobileMenu">{{ t("website.nav.solutions") }}</a>
          <a href="/#for-dentists" class="layout-default__mobile-link" @click="closeMobileMenu">{{ t("website.nav.forDentists") }}</a>
          <a href="/#for-patients" class="layout-default__mobile-link" @click="closeMobileMenu">{{ t("website.nav.forPatients") }}</a>
          <RouterLink to="/about" class="layout-default__mobile-link" @click="closeMobileMenu">{{ t("website.nav.about") }}</RouterLink>
          <RouterLink to="/contact" class="layout-default__mobile-link" @click="closeMobileMenu">{{ t("website.nav.contact") }}</RouterLink>
          <a href="/#cta" class="layout-default__mobile-cta" @click="closeMobileMenu">{{ t("website.header.cta") }}</a>
        </div>
      </aside>
    </Transition>
    <main class="layout-default__main">
      <RouterView />
    </main>
    <footer class="layout-default__footer">
      <div class="layout-default__footer-inner">
        <div class="layout-default__footer-brand">
          <LogoIcon class="layout-default__logo-icon layout-default__logo-icon--footer" :on-dark="true" />
          <span class="layout-default__logo-text layout-default__logo-text--footer">{{ t("website.logo") }}</span>
          <p class="layout-default__footer-tagline">{{ t("website.footer.tagline") }}</p>
        </div>
        <div class="layout-default__footer-col">
          <h4 class="layout-default__footer-heading">{{ t("website.footer.product") }}</h4>
          <a href="/#solutions" class="layout-default__footer-link">{{ t("website.footer.product.solutions") }}</a>
          <a href="/#for-dentists" class="layout-default__footer-link">{{ t("website.footer.product.forDentists") }}</a>
          <a href="/#for-patients" class="layout-default__footer-link">{{ t("website.footer.product.forPatients") }}</a>
          <a href="/#cta" class="layout-default__footer-link">{{ t("website.footer.product.pricing") }}</a>
        </div>
        <div class="layout-default__footer-col">
          <h4 class="layout-default__footer-heading">{{ t("website.footer.company") }}</h4>
          <a href="/about" class="layout-default__footer-link">{{ t("website.footer.company.about") }}</a>
          <a href="#" class="layout-default__footer-link">{{ t("website.footer.company.careers") }}</a>
          <a href="#" class="layout-default__footer-link">{{ t("website.footer.company.press") }}</a>
          <a href="/contact" class="layout-default__footer-link">{{ t("website.footer.company.contact") }}</a>
        </div>
        <div class="layout-default__footer-col">
          <h4 class="layout-default__footer-heading">{{ t("website.footer.resources") }}</h4>
          <a href="#" class="layout-default__footer-link">{{ t("website.footer.resources.blog") }}</a>
          <a href="#" class="layout-default__footer-link">{{ t("website.footer.resources.help") }}</a>
          <a href="#" class="layout-default__footer-link">{{ t("website.footer.resources.research") }}</a>
          <a href="#" class="layout-default__footer-link">{{ t("website.footer.resources.privacy") }}</a>
        </div>
        <div class="layout-default__footer-col">
          <h4 class="layout-default__footer-heading">{{ t("website.footer.connect") }}</h4>
          <a href="#" class="layout-default__footer-link">{{ t("website.footer.connect.twitter") }}</a>
          <a href="#" class="layout-default__footer-link">{{ t("website.footer.connect.linkedin") }}</a>
          <a href="#" class="layout-default__footer-link">{{ t("website.footer.connect.facebook") }}</a>
          <a href="#" class="layout-default__footer-link">{{ t("website.footer.connect.instagram") }}</a>
        </div>
      </div>
      <div class="layout-default__footer-copy">
        <p>© {{ new Date().getFullYear() }} NeoSleep. {{ t("website.footer.rights") }}</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import LogoIcon from "../components/LogoIcon.vue";
import ThemeToggle from "../components/ThemeToggle.vue";
import LanguageSelect from "../components/LanguageSelect.vue";
import ContainerStyleToggle from "../components/ContainerStyleToggle.vue";
import { useTheme } from "../composables/useTheme";
import { useContainerStyle } from "../composables/useContainerStyle";

const { t } = useI18n();
const { isDark } = useTheme();
const { isCompact } = useContainerStyle();
const mobileMenuOpen = ref(false);

function closeMobileMenu() {
  mobileMenuOpen.value = false;
}
</script>

<style lang="scss" scoped>
.layout-default {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.layout-default__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid var(--website-border);
}

.layout-default__header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.layout-default__hamburger {
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

.layout-default__hamburger-bar {
  display: block;
  width: 22px;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.layout-default__header-open .layout-default__hamburger-bar:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}
.layout-default__header-open .layout-default__hamburger-bar:nth-child(2) {
  opacity: 0;
}
.layout-default__header-open .layout-default__hamburger-bar:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

.layout-default__header-right {
  display: none;
  align-items: center;
  gap: 0.5rem;
}

.layout-default__theme-mobile {
  flex-shrink: 0;
}

.layout-default--dark .layout-default__header {
  background: rgba(15, 20, 25, 0.9);
}

.layout-default__brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: var(--website-text);
}

.layout-default__logo-icon {
  flex-shrink: 0;

  &--footer {
    color: #fff;
  }
}

.layout-default__logo-text {
  font-weight: 700;
  font-size: 1.25rem;
  letter-spacing: -0.02em;

  &--footer {
    color: #fff;
  }
}

.layout-default__nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.layout-default__nav-tools {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.layout-default__nav-link {
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

.layout-default__cta {
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

.layout-default__main {
  flex: 1;
  position: relative;
  z-index: 2;
}

.layout-default__footer {
  background: var(--website-footer-bg);
  color: #fff;
  padding: 3rem 1.5rem 2rem;
  position: relative;
  z-index: 2;
}

/* Compact container: footer not full width, like Genesis */
.layout-default--container-compact .layout-default__footer {
  width: calc(100% - 3rem);
  max-width: 1280px;
  margin: 2rem auto 0;
  border-radius: calc(var(--website-radius) * 2);
  border-top-left-radius: calc(var(--website-radius) * 2);
  border-top-right-radius: calc(var(--website-radius) * 2);
}

.layout-default__footer-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.5fr repeat(4, 1fr);
  gap: 2rem;
}

@media (max-width: 900px) {
  .layout-default__nav--desktop {
    display: none;
  }

  .layout-default__hamburger {
    display: flex;
  }

  .layout-default__header-right {
    display: flex;
    align-items: center;
  }
}

.layout-default__mobile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 11;
  top: 0;
}

.layout-default__mobile-menu {
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

.layout-default__mobile-menu-inner {
  display: flex;
  flex-direction: column;
  padding: 1rem 0;
  gap: 0.25rem;
}

.layout-default__mobile-menu-lang {
  padding: 0 1rem 1rem;
  border-bottom: 1px solid var(--website-border);
  margin-bottom: 0.5rem;
}

.layout-default__mobile-link {
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

.layout-default__mobile-cta {
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

@media (max-width: 600px) {
  .layout-default__footer-inner {
    grid-template-columns: 1fr;
    text-align: center;
  }
}

.layout-default__footer-brand {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.layout-default__footer-brand .layout-default__logo-icon {
  align-self: flex-start;
}

.layout-default__footer-tagline {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.5;
  margin: 0;
  max-width: 240px;
}

.layout-default__footer-heading {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.9);
  margin: 0 0 1rem;
}

.layout-default__footer-col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.layout-default__footer-link {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.875rem;
  text-decoration: none;
  transition: color 0.2s ease;

  &:hover {
    color: #fff;
  }
}

.layout-default__footer-copy {
  padding-top: 2rem;
  margin-top: 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  text-align: center;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.75);

  p {
    margin: 0;
  }
}
</style>
