<template>
  <div class="theme-toggle" :data-mode="themeMode">
    <NavTooltip :text="toggleLabel">
      <button
        type="button"
        class="theme-toggle__btn"
        :class="{ 'theme-toggle__btn--spinning': isSpinning }"
        :aria-label="toggleLabel"
        @click="onClick"
      >
        <span class="theme-toggle__icon theme-toggle__icon--auto" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </span>
        <span class="theme-toggle__icon theme-toggle__icon--sun" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
          </svg>
        </span>
        <span class="theme-toggle__icon theme-toggle__icon--moon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
          </svg>
        </span>
      </button>
    </NavTooltip>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import NavTooltip from "./NavTooltip.vue";
import { useTheme } from "../composables/useTheme";
import type { ThemeMode } from "../composables/useTheme";

const THEME_ORDER: ThemeMode[] = ["auto", "light", "dark"];
const SPIN_MS = 450; // must match CSS animation duration

function getNextMode(current: ThemeMode): ThemeMode {
  const i = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(i + 1) % THEME_ORDER.length];
}

const { t } = useI18n();
const { themeMode, setTheme } = useTheme();
const isSpinning = ref(false);

const toggleLabel = computed(() => {
  const current = t(`rep.settings.theme.${themeMode.value}`);
  const next = t(`rep.settings.theme.${getNextMode(themeMode.value)}`);
  return t("rep.settings.theme.tooltip", { current, next });
});

function onClick() {
  if (isSpinning.value) return;
  const next = getNextMode(themeMode.value);
  isSpinning.value = true;

  // Apply theme at animation midpoint so icon swaps "behind" the rotation
  setTimeout(() => {
    document.documentElement.classList.add("theme-transitioning");
    setTheme(next);
    setTimeout(() => document.documentElement.classList.remove("theme-transitioning"), 225);
  }, SPIN_MS / 2);

  // Unlock after the full animation — reliable alternative to animationend
  setTimeout(() => { isSpinning.value = false; }, SPIN_MS);
}
</script>

<style lang="scss" scoped>
.theme-toggle {
  position: relative;
}

.theme-toggle__btn {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid var(--website-border);
  background: var(--website-bg);
  color: var(--website-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s, background 0.2s, color 0.2s;

  &:hover {
    border-color: var(--website-primary);
    color: var(--website-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--website-primary);
    outline-offset: 2px;
  }

  &--spinning {
    animation: theme-toggle-spin 0.45s cubic-bezier(0.4, 0, 0.2, 1) forwards;

    .theme-toggle__icon {
      transition: none;
    }
  }
}

@keyframes theme-toggle-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.theme-toggle__icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: rotate(90deg) scale(0.6);
  transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  svg {
    width: 24px;
    height: 24px;
  }
}

.theme-toggle[data-mode="auto"]  .theme-toggle__icon--auto,
.theme-toggle[data-mode="light"] .theme-toggle__icon--sun,
.theme-toggle[data-mode="dark"]  .theme-toggle__icon--moon {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}

</style>
