<template>
  <header
    class="site-header"
    :class="{ 'site-header--hidden': headerHidden }"
    role="banner"
  >
    <div class="site-header__bar">
      <RouterLink to="/" class="site-header__brand">
        <BrandLogo :dark="isDark" class="site-header__logo" width="140" height="32" />
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

  <MobileNavDrawer v-model="mobileOpen" width="var(--website-drawer-width)" aria-label="Mobile navigation">
    <template #header>
      <!-- Search — aligned to header height -->
      <div class="site-header__drawer-header">
        <div class="site-header__drawer-search" role="search">
          <svg class="site-header__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="search"
            class="site-header__search-input"
            :placeholder="t('website.nav.searchPlaceholder')"
            :aria-label="t('website.nav.search')"
            autocomplete="off"
            @keydown.escape="searchQuery = ''"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="site-header__search-clear"
            :aria-label="t('website.nav.menuClose')"
            @click="searchQuery = ''"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- Nav links / Search results -->
    <div class="site-header__drawer-nav" aria-label="Mobile navigation links">
      <!-- Default nav -->
      <template v-if="!searchQuery">
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
      </template>

      <!-- Search results -->
      <template v-else>
        <template v-if="searchResults.length">
          <component
            :is="item.requiresAuth ? 'div' : 'RouterLink'"
            v-for="item in searchResults"
            :key="item.titleKey"
            v-bind="item.requiresAuth ? {} : { to: item.path }"
            class="site-header__result"
            :class="{ 'site-header__result--locked': item.requiresAuth }"
            @click="!item.requiresAuth && closeMobile()"
          >
            <span class="site-header__result-title">{{ t(item.titleKey) }}</span>
            <span class="site-header__result-desc">{{ t(item.descKey) }}</span>
            <span v-if="item.requiresAuth" class="site-header__result-lock">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              {{ t('website.nav.searchProtected') }}
            </span>
          </component>
        </template>
        <p v-else class="site-header__no-results">
          {{ t('website.nav.searchNoResults', { query: searchQuery }) }}
        </p>
      </template>
    </div>
  </MobileNavDrawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { BrandLogo, MobileNavDrawer } from "@ui";
import ThemeToggle from "../components/ThemeToggle.vue";
import LanguageSelect from "../components/LanguageSelect.vue";
import { useTheme } from "../composables/useTheme";
import { getHeaderNavItems } from "../config/websiteNav";
import { searchIndex } from "../config/websiteContent";

const { t } = useI18n();
const { isDark } = useTheme();
const mobileOpen = ref(false);
const navItems = getHeaderNavItems();

// ── Search ────────────────────────────────────────────────────────────────
const searchQuery = ref("");
const searchInputRef = ref<HTMLInputElement | null>(null);

const searchResults = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return [];
  return searchIndex.filter((item) => {
    if (item.requiresAuth) return false;
    const title = t(item.titleKey).toLowerCase();
    const desc  = t(item.descKey).toLowerCase();
    return title.includes(q) || desc.includes(q);
  });
});

function closeMobile() {
  mobileOpen.value = false;
}

// Swipe-to-close and overlay-click (inside MobileNavDrawer) also flip
// mobileOpen straight to false, bypassing closeMobile() — clear search here
// so all three close paths behave the same.
watch(mobileOpen, (open) => {
  if (!open) searchQuery.value = "";
});

// ── Scroll-hide on mobile ─────────────────────────────────────────────────
const headerHidden = ref(false);
let lastScrollY = 0;

function onScroll() {
  if (window.innerWidth > 1100) {
    headerHidden.value = false;
    return;
  }
  const y = window.scrollY;
  const delta = y - lastScrollY;
  if (delta > 8 && y > 72) headerHidden.value = true;
  else if (delta < -8) headerHidden.value = false;
  lastScrollY = y;
}

onMounted(() => {
  lastScrollY = window.scrollY;
  window.addEventListener("scroll", onScroll, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener("scroll", onScroll);
});
</script>

<style scoped src="./DefaultHeader.css" />
