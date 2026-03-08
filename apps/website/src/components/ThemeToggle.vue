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
        v-if="wave.active"
        ref="waveRef"
        class="theme-toggle__wave"
        :class="[waveClass, { 'theme-toggle__wave--expand': wave.expand }]"
        :style="waveStyle"
        aria-hidden="true"
        @transitionend="onWaveEnd"
      />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import NavTooltip from "./NavTooltip.vue";
import { useTheme } from "../composables/useTheme";
import type { ThemeMode } from "../composables/useTheme";

const THEME_ORDER: ThemeMode[] = ["auto", "light", "dark"];

function getNextMode(current: ThemeMode): ThemeMode {
  const i = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(i + 1) % THEME_ORDER.length];
}

function isDarkMode(mode: ThemeMode): boolean {
  if (mode === "auto" && typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return mode === "dark";
}

function getButtonCenter(btn: HTMLElement): { x: number; y: number } {
  const r = btn.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const { t } = useI18n();
const { themeMode, setTheme } = useTheme();
const btnRef = ref<HTMLElement | null>(null);
const waveRef = ref<HTMLElement | null>(null);

const wave = reactive({
  active: false,
  expand: false,
  targetDark: false,
  origin: { x: 0, y: 0 },
  pendingMode: null as ThemeMode | null,
});

const toggleLabel = computed(() => {
  const current = t(`rep.settings.theme.${themeMode.value}`);
  const next = t(`rep.settings.theme.${getNextMode(themeMode.value)}`);
  return t("rep.settings.theme.tooltip", { current, next });
});

const waveClass = computed(() =>
  wave.targetDark ? "theme-toggle__wave--dark" : "theme-toggle__wave--light"
);

const waveStyle = computed(() => ({
  left: `${wave.origin.x}px`,
  top: `${wave.origin.y}px`,
}));

async function startWaveTransition(button: HTMLElement, nextMode: ThemeMode) {
  wave.origin = getButtonCenter(button);
  wave.targetDark = isDarkMode(nextMode);
  wave.pendingMode = nextMode;
  wave.expand = false;
  wave.active = true;
  await nextTick();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      wave.expand = true;
    });
  });
}

function onClick() {
  const btn = btnRef.value;
  if (!btn) return;
  startWaveTransition(btn, getNextMode(themeMode.value));
}

function onWaveEnd(e: TransitionEvent) {
  if (e.target !== waveRef.value || e.propertyName !== "transform") return;
  if (wave.pendingMode !== null) {
    setTheme(wave.pendingMode);
    wave.pendingMode = null;
  }
  wave.expand = false;
  wave.active = false;
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

.theme-toggle[data-mode="auto"] .theme-toggle__icon--auto,
.theme-toggle[data-mode="light"] .theme-toggle__icon--sun,
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
