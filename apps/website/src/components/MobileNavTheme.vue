<template>
  <button
    type="button"
    class="nav-theme"
    :data-mode="themeMode"
    :class="{ 'nav-theme--spinning': isSpinning }"
    :aria-label="ariaLabel"
    @click="onToggle"
  
  >
    <span class="nav-theme__icon" aria-hidden="true">
      <span class="nav-theme__ti nav-theme__ti--auto">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 4v6h-6"/>
          <path d="M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
      </span>
      <span class="nav-theme__ti nav-theme__ti--sun">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      </span>
      <span class="nav-theme__ti nav-theme__ti--moon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
        </svg>
      </span>
    </span>
    <span class="nav-theme__label">{{ shortLabel }}</span>
  </button>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme } from '../composables/useTheme'
import type { ThemeMode } from '../composables/useTheme'

const { t } = useI18n()
const { themeMode, setTheme } = useTheme()

const ORDER: ThemeMode[] = ['auto', 'light', 'dark']
const SHORT_LABELS: Record<ThemeMode, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' }

function nextMode(m: ThemeMode): ThemeMode {
  return ORDER[(ORDER.indexOf(m) + 1) % ORDER.length]
}

const isSpinning = ref(false)
const shortLabel = computed(() => SHORT_LABELS[themeMode.value])
const ariaLabel = computed(() => {
  const current = t(`user.settings.theme.${themeMode.value}`)
  const next = t(`user.settings.theme.${nextMode(themeMode.value)}`)
  return t('user.settings.theme.tooltip', { current, next })
})

const SPIN_MS = 450

function onToggle() {
  if (isSpinning.value) return
  const next = nextMode(themeMode.value)
  isSpinning.value = true
  setTimeout(() => {
    document.documentElement.classList.add('theme-transitioning')
    setTheme(next)
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 225)
  }, SPIN_MS / 2)
  setTimeout(() => { isSpinning.value = false }, SPIN_MS)
}
</script>

<style lang="scss" scoped>
@use '../assets/mobile-nav-item' as nav;

.nav-theme {
  @include nav.item-base;
}

.nav-theme__icon {
  @include nav.icon;
}

.nav-theme__label {
  @include nav.label;
}

// ── Theme icon states ─────────────────────────────────────────────────────────
.nav-theme__ti {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: rotate(90deg) scale(0.6);
  transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  svg { width: 22px; height: 22px; }
}

.nav-theme[data-mode="auto"]  .nav-theme__ti--auto,
.nav-theme[data-mode="light"] .nav-theme__ti--sun,
.nav-theme[data-mode="dark"]  .nav-theme__ti--moon {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}

// ── Spin animation ────────────────────────────────────────────────────────────
.nav-theme--spinning {
  animation: nav-theme-spin 0.45s cubic-bezier(0.4, 0, 0.2, 1) forwards;

  .nav-theme__ti { transition: none; }
}

@keyframes nav-theme-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
</style>
