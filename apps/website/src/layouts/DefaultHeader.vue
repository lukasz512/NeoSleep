<template>
  <header
    class="site-header"
    :class="{ 'site-header--hidden': headerHidden }"
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
      :style="drawerSwipeStyle"
      aria-label="Mobile navigation"
      role="dialog"
      aria-modal="true"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend="onTouchEnd"
    >
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

      <!-- Nav links / Search results -->
      <nav class="site-header__drawer-nav" aria-label="Mobile navigation links">
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
      </nav>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
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

// ── Swipe to close ────────────────────────────────────────────────────────
const drawerX = ref(0);
let touchStartX = 0;

const drawerSwipeStyle = computed(() =>
  drawerX.value ? { transform: `translateX(${drawerX.value}px)`, transition: "none" } : {}
);

function onTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0]!.clientX;
}

function onTouchMove(e: TouchEvent) {
  const delta = e.touches[0]!.clientX - touchStartX;
  if (delta < 0) drawerX.value = delta;
}

function onTouchEnd() {
  if (drawerX.value < -72) {
    closeMobile();
  } else {
    drawerX.value = 0;
  }
}

const logoSrc = computed(() =>
  isDark.value ? "/brand/logos/logo/logo_dark.svg" : "/brand/logos/logo/logo_light.svg"
);

function closeMobile() {
  drawerX.value = 0;
  mobileOpen.value = false;
  searchQuery.value = "";
}

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

<style scoped>
/*
 * DefaultHeader — white-label ready.
 * All colours come from CSS variables defined in website-theme.scss.
 * Swap --website-primary / --website-bg / --website-border to re-skin.
 * Mobile breakpoint: 1100px (--website-nav-breakpoint, CSS-variable only).
 */

/* ── Shared transition (theme change) ──────────────────────────────────── */
.site-header,
.site-header__drawer {
  transition:
    transform 0.3s ease,
    background-color 0.35s ease,
    color 0.35s ease,
    border-color 0.35s ease;
}

/* ── Header bar ─────────────────────────────────────────────────────────── */
.site-header {
  position: fixed;
  inset: 0 0 auto;               /* top / left / right, height driven by content */
  z-index: 9999;
  min-height: var(--website-header-height);
  background: var(--website-bg);
  color: var(--website-text);
  border-bottom: 1px solid var(--website-border);
}

.site-header--hidden {
  @media (max-width: 1100px) { transform: translateY(-100%); }
}

.site-header__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--website-header-height);
  padding: 0 var(--website-page-gutter);
  gap: 1rem;

  @media (max-width: 1100px) {
    padding: 0 var(--website-page-gutter-mobile);
  }
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

/* ── Desktop nav ────────────────────────────────────────────────────────── */
.site-header__nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.site-header__link {
  color: inherit;
  text-decoration: none;
  font-size: 0.9375rem;
  padding: 0.5rem 0.625rem;
  border-radius: 8px;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background: color-mix(in srgb, var(--website-primary) 10%, transparent);
    color: var(--website-primary);
  }
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
  transition: background-color 0.15s ease;

  &:hover { background: var(--website-primary-hover); }
}

/* ── Hamburger ──────────────────────────────────────────────────────────── */
.site-header__hamburger {
  display: none;
  order: -1;
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

  @media (max-width: 1100px) { display: flex; }
}

.site-header__hamburger-bar {
  display: block;
  width: 22px;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
  flex-shrink: 0;
}

/* ── Nav breakpoint ─────────────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .site-header__nav { display: none; }
}

/* ── Overlay ────────────────────────────────────────────────────────────── */
.site-header__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 10000;
}

/* ── Drawer ─────────────────────────────────────────────────────────────── */
.site-header__drawer {
  position: fixed;
  inset: 0 auto 0 0;             /* full height, left-anchored */
  width: var(--website-drawer-width);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  background: var(--website-bg);
  color: var(--website-text);
  border-right: 1px solid var(--website-border);
}

/*
 * Drawer header: same height / bg / border as .site-header__bar
 * so the two panels look like one continuous top bar.
 */
.site-header__drawer-header {
  flex-shrink: 0;
  height: var(--website-header-height);
  display: flex;
  align-items: center;
  padding: 0 var(--website-page-gutter-mobile);
  background: var(--website-bg);
  border-bottom: 1px solid var(--website-border);
  transition: background-color 0.35s ease, border-color 0.35s ease;
}

.site-header__drawer-search {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--website-primary) 30%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--website-primary) 8%, var(--website-bg));
  color: var(--website-text);
  transition: border-color 0.15s ease, background-color 0.35s ease;

  &:focus-within {
    border-color: var(--website-primary);
    background: color-mix(in srgb, var(--website-primary) 12%, var(--website-bg));
  }
}

.site-header__search-icon {
  flex-shrink: 0;
  color: var(--website-primary);
}

.site-header__search-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--website-text);
  font-family: inherit;
  font-size: 0.9375rem;
  outline: none;
  min-width: 0;

  &::placeholder { color: var(--website-text-secondary); }

  /* Remove browser default clear button — we have our own */
  &::-webkit-search-cancel-button { display: none; }
}

.site-header__search-clear {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  color: var(--website-text-secondary);
  cursor: pointer;
  padding: 0;
  border-radius: 4px;
  transition: color 0.15s ease;

  &:hover { color: var(--website-primary); }
}

/* Scrollable nav links */
.site-header__drawer-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.site-header__drawer-link {
  display: block;
  padding: 0.75rem 1rem;
  color: var(--website-text);
  text-decoration: none;
  font-size: 1rem;
  border-radius: 8px;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background: color-mix(in srgb, var(--website-primary) 8%, transparent);
    color: var(--website-primary);
  }
}

/* ── Search results ─────────────────────────────────────────────────────── */
.site-header__result {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.625rem 1rem;
  border-radius: 8px;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:hover:not(.site-header__result--locked) {
    background: color-mix(in srgb, var(--website-primary) 8%, transparent);
  }

  &--locked {
    opacity: 0.55;
    cursor: default;
  }
}

.site-header__result-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--website-text);
  line-height: 1.3;
}

.site-header__result-desc {
  font-size: 0.8125rem;
  color: var(--website-text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.site-header__result-lock {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: var(--website-primary);
  font-weight: 500;
}

.site-header__no-results {
  padding: 1rem;
  font-size: 0.9375rem;
  color: var(--website-text-secondary);
  text-align: center;
  margin: 0;
}

/* ── Vue transitions ────────────────────────────────────────────────────── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,  .fade-leave-to      { opacity: 0; }

.slide-enter-active, .slide-leave-active { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-enter-from,   .slide-leave-to     { transform: translateX(-100%); }
</style>
