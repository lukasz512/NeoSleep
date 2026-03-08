<template>
  <div class="layout-default">
    <header class="layout-default__header">
      <RouterLink to="/" class="layout-default__brand">
        <LogoIcon class="layout-default__logo-icon" />
        <span class="layout-default__logo-text">{{ t("website.logo") }}</span>
      </RouterLink>
      <nav class="layout-default__nav" aria-label="Main navigation">
        <a href="/#solutions" class="layout-default__nav-link">{{ t("website.nav.solutions") }}</a>
        <a href="/#for-dentists" class="layout-default__nav-link">{{ t("website.nav.forDentists") }}</a>
        <a href="/#for-patients" class="layout-default__nav-link">{{ t("website.nav.forPatients") }}</a>
        <RouterLink to="/about" class="layout-default__nav-link">{{ t("website.nav.about") }}</RouterLink>
        <RouterLink to="/contact" class="layout-default__nav-link">{{ t("website.nav.contact") }}</RouterLink>
        <a href="/#cta" class="layout-default__cta">{{ t("website.header.cta") }}</a>
      </nav>
    </header>
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
import { useI18n } from "vue-i18n";
import LogoIcon from "../components/LogoIcon.vue";

const { t } = useI18n();
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
}

.layout-default__footer {
  background: var(--website-footer-bg);
  color: #fff;
  padding: 3rem 1.5rem 2rem;
}

.layout-default__footer-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.5fr repeat(4, 1fr);
  gap: 2rem;
}

@media (max-width: 900px) {
  .layout-default__footer-inner {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 600px) {
  .layout-default__footer-inner {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .layout-default__nav {
    flex-wrap: wrap;
    justify-content: flex-end;
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
