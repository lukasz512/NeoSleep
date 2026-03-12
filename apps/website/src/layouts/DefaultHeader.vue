<template>
  <header
    class="site-header"
    :style="headerStyle"
    role="banner"
  >
    <div class="site-header__bar">
      <RouterLink to="/" class="site-header__brand">
        <img :src="logoSrc" alt="NeoSleep" class="site-header__logo" width="140" height="32" />
      </RouterLink>
      <nav class="site-header__nav" aria-label="Main navigation">
        <template v-for="item in navItems" :key="item.labelKey">
          <RouterLink
            v-if="item.to"
            :to="item.to"
            :class="item.cta ? 'site-header__cta' : 'site-header__link'"
            @click="closeMobile"
          >
            {{ t(item.labelKey) }}
          </RouterLink>
          <a
            v-else
            :href="item.href"
            :class="item.cta ? 'site-header__cta' : 'site-header__link'"
          >
            {{ t(item.labelKey) }}
          </a>
        </template>
        <LanguageSelect />
        <ThemeToggle />
      </nav>
      <button
        type="button"
        class="site-header__hamburger"
        :aria-label="mobileOpen ? t('website.nav.menuClose') : t('website.nav.menuOpen')"
        :aria-expanded="mobileOpen"
        @click="mobileOpen = !mobileOpen"
      >
        <span class="site-header__hamburger-bar" />
        <span class="site-header__hamburger-bar" />
        <span class="site-header__hamburger-bar" />
      </button>
    </div>
  </header>
  <Transition name="fade">
    <div
      v-show="mobileOpen"
      class="site-header__overlay"
      aria-hidden="true"
      @click="closeMobile"
    />
  </Transition>
  <Transition name="slide">
    <aside
      v-show="mobileOpen"
      class="site-header__drawer"
      aria-label="Mobile navigation"
      role="dialog"
      aria-modal="true"
    >
      <div class="site-header__drawer-inner">
        <ThemeToggle />
        <LanguageSelect />
        <template v-for="item in navItems" :key="item.labelKey">
          <RouterLink
            v-if="item.to"
            :to="item.to"
            class="site-header__drawer-link"
            @click="closeMobile"
          >
            {{ t(item.labelKey) }}
          </RouterLink>
          <a v-else :href="item.href" class="site-header__drawer-link" @click="closeMobile">
            {{ t(item.labelKey) }}
          </a>
        </template>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import ThemeToggle from "../components/ThemeToggle.vue";
import LanguageSelect from "../components/LanguageSelect.vue";
import { useTheme } from "../composables/useTheme";
import { getHeaderNavItems } from "../config/websiteNavConfig";

const { t } = useI18n();
const { isDark } = useTheme();
const mobileOpen = ref(false);
const navItems = getHeaderNavItems();

const logoSrc = computed(() =>
  isDark.value ? "/brand/logos/logo/logo_dark.svg" : "/brand/logos/logo/logo_light.svg"
);

const headerStyle = computed(() => ({
  backgroundColor: isDark.value ? "#0f1419" : "#ffffff",
  color: isDark.value ? "#e6edf3" : "#474747",
  borderBottom: isDark.value ? "1px solid #2d3748" : "1px solid #e5e7eb",
}));

function closeMobile() {
  mobileOpen.value = false;
}

onMounted(() => {
  console.log("[Header] mounted");
});
</script>

<style scoped>
.site-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  min-height: 72px;
}

.site-header__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  gap: 1rem;
}

.site-header__brand {
  display: inline-flex;
  text-decoration: none;
  color: inherit;
}

.site-header__logo {
  height: 32px;
  width: auto;
  display: block;
}

.site-header__nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.site-header__link {
  color: inherit;
  text-decoration: none;
  font-size: 0.9375rem;
  padding: 0.5rem;
  border-radius: 8px;
}

.site-header__link:hover {
  background: rgba(18, 143, 131, 0.1);
  color: var(--website-primary);
}

.site-header__cta {
  display: inline-flex;
  align-items: center;
  padding: 0.5rem 1.25rem;
  background: var(--website-primary);
  color: #fff;
  font-weight: 600;
  font-size: 0.9375rem;
  text-decoration: none;
  border-radius: 9999px;
}

.site-header__cta:hover {
  background: var(--website-primary-hover);
  color: #fff;
}

.site-header__hamburger {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.site-header__hamburger-bar {
  display: block;
  width: 22px;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
  flex-shrink: 0;
}

.site-header__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 10000;
}

.site-header__drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: min(300px, 85vw);
  background: var(--website-bg);
  border-right: 1px solid var(--website-border);
  z-index: 10001;
  overflow: auto;
}

.site-header__drawer-inner {
  display: flex;
  flex-direction: column;
  padding: 1rem;
  gap: 0.5rem;
}

.site-header__drawer-link {
  display: block;
  padding: 0.75rem 1rem;
  color: var(--website-text);
  text-decoration: none;
}

.site-header__drawer-link:hover {
  background: rgba(18, 143, 131, 0.08);
  color: var(--website-primary);
}

@media (max-width: 900px) {
  .site-header__nav {
    display: none;
  }

  .site-header__hamburger {
    display: flex;
    order: -1;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}
</style>
