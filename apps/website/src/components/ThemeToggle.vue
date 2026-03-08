<template>
  <div class="theme-toggle" :data-mode="themeMode">
    <NavTooltip :text="toggleLabel">
    <button
      ref="btnRef"
      type="button"
      class="theme-toggle__btn"
      :aria-label="toggleLabel"
      @click="onClick"
    >
      <span class="theme-toggle__icon theme-toggle__icon--auto" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
          <path d="M21 21v-5h-5"/>
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
    <Transition name="theme-wave">
      <div
        v-if="waveActive"
        ref="waveRef"
        class="theme-toggle__wave"
        :class="[waveClass, { 'theme-toggle__wave--expand': waveExpand }]"
        :style="waveStyle"
        aria-hidden="true"
        @transitionend="onWaveEnd"
      />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import NavTooltip from "./NavTooltip.vue";
import { useTheme } from "../composables/useTheme";
import type { ThemeMode } from "../composables/useTheme";

const { t } = useI18n();
const { isDark, themeMode, setTheme } = useTheme();

const btnRef = ref<HTMLElement | null>(null);
const waveRef = ref<HTMLElement | null>(null);
const waveActive = ref(false);
const waveExpand = ref(false);
const waveTargetDark = ref(false);
const waveOrigin = ref({ x: 0, y: 0 });
const pendingMode = ref<ThemeMode | null>(null);

const ORDER: ThemeMode[] = ["auto", "light", "dark"];
function getNextMode(): ThemeMode {
  const i = ORDER.indexOf(themeMode.value);
  return ORDER[(i + 1) % ORDER.length];
}
function resolveDark(mode: ThemeMode): boolean {
  if (mode === "auto" && typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return mode === "dark";
}

const toggleLabel = computed(() =>
  isDark.value ? t("rep.settings.theme.switchToLight") : t("rep.settings.theme.switchToDark")
);

const waveClass = computed(() =>
  waveTargetDark.value ? "theme-toggle__wave--dark" : "theme-toggle__wave--light"
);

const waveStyle = computed(() => ({
  left: `${waveOrigin.value.x}px`,
  top: `${waveOrigin.value.y}px`,
}));

async function onClick() {
  const btn = btnRef.value;
  if (!btn) return;
  const next = getNextMode();
  const nextDark = resolveDark(next);
  pendingMode.value = next;
  const rect = btn.getBoundingClientRect();
  waveOrigin.value = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  waveTargetDark.value = nextDark;
  waveExpand.value = false;
  waveActive.value = true;
  await nextTick();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      waveExpand.value = true;
    });
  });
}

function onWaveEnd(e: TransitionEvent) {
  if (e.target !== waveRef.value || e.propertyName !== "transform") return;
  if (pendingMode.value !== null) {
    setTheme(pendingMode.value);
    pendingMode.value = null;
  }
  waveExpand.value = false;
  waveActive.value = false;
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
  transition: border-color 0.2s, background 0.2s, color 0.2s, transform 0.25s ease;

  &:hover {
    border-color: var(--website-primary);
    color: var(--website-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--website-primary);
    outline-offset: 2px;
  }
}

.theme-toggle__icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.5);
  transition: opacity 0.25s ease, transform 0.25s ease;

  svg {
    width: 24px;
    height: 24px;
  }
}

/* Auto (system): show monitor icon */
.theme-toggle[data-mode="auto"] .theme-toggle__icon--auto {
  opacity: 1;
  transform: scale(1);
}

/* Light: show sun */
.theme-toggle[data-mode="light"] .theme-toggle__icon--sun {
  opacity: 1;
  transform: scale(1);
}

/* Dark: show moon */
.theme-toggle[data-mode="dark"] .theme-toggle__icon--moon {
  opacity: 1;
  transform: scale(1);
}

.theme-toggle__wave {
  position: fixed;
  width: 200vmax;
  height: 200vmax;
  margin-left: -100vmax;
  margin-top: -100vmax;
  border-radius: 50%;
  pointer-events: none;
  z-index: 1;
  transform: scale(0);
  transition: transform 0.85s cubic-bezier(0.4, 0, 0.2, 1);
}

.theme-toggle__wave--light {
  background: #ffffff;
}

.theme-toggle__wave--dark {
  background: #0f1419;
}

.theme-toggle__wave--expand {
  transform: scale(1);
}

.theme-wave-enter-active,
.theme-wave-leave-active {
  transition: none;
}
</style>
