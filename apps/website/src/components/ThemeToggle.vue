<template>
  <div class="theme-toggle" :data-mode="themeMode" :data-dark="isDark">
    <NavTooltip :text="toggleLabel">
      <button
        ref="btnRef"
        type="button"
        class="theme-toggle__btn"
        :aria-label="toggleLabel"
        @click="onClick"
      >
        <span class="theme-toggle__track" aria-hidden="true">
          <span class="theme-toggle__track-sun" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
            </svg>
          </span>
          <span class="theme-toggle__track-moon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
            </svg>
          </span>
        </span>
        <span class="theme-toggle__knob" aria-hidden="true">
          <span class="theme-toggle__knob-inner">
            <svg v-if="!isDark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
            </svg>
          </span>
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
$pill-w: 52px;
$pill-h: 26px;
$knob-d: 22px;
$knob-offset: 2px;

.theme-toggle {
  position: relative;
}

.theme-toggle__btn {
  position: relative;
  width: $pill-w;
  height: $pill-h;
  padding: 0;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  overflow: hidden;

  &:focus-visible {
    outline: 2px solid var(--website-primary);
    outline-offset: 2px;
  }
}

/* Pill track: day = sky blue, night = dark blue */
.theme-toggle__track {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: #7dd3fc;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
  transition: background 0.4s ease, box-shadow 0.3s ease;
}

.theme-toggle[data-dark="true"] .theme-toggle__track {
  background: rgb(32, 62, 120);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.25);
}

/* Side icons (sun left, moon right) */
.theme-toggle__track-sun,
.theme-toggle__track-moon {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.9);
  transition: opacity 0.25s ease;

  svg {
    width: 12px;
    height: 12px;
  }
}

.theme-toggle__track-sun {
  left: 8px;
}

.theme-toggle__track-moon {
  right: 8px;
}

.theme-toggle[data-dark="true"] .theme-toggle__track-sun {
  opacity: 0.35;
}

.theme-toggle[data-dark="false"] .theme-toggle__track-moon {
  opacity: 0.35;
}

/* Sliding knob with depth */
.theme-toggle__knob {
  position: absolute;
  top: $knob-offset;
  left: $knob-offset;
  width: $knob-d;
  height: $knob-d;
  border-radius: 50%;
  z-index: 1;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  transform: translateX(0);
}

.theme-toggle[data-dark="true"] .theme-toggle__knob {
  transform: translateX($pill-w - $knob-d - 2 * $knob-offset);
}

/* Knob inner: gradient + shadow for depth (day = warm, night = cool) */
.theme-toggle__knob-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #e6eda9 0%, #d7a251 100%);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  color: #8b6914;
  transition: background 0.35s ease, box-shadow 0.35s ease, color 0.35s ease;

  svg {
    width: 12px;
    height: 12px;
  }
}

.theme-toggle[data-dark="true"] .theme-toggle__knob-inner {
  background: linear-gradient(180deg, #f7fafb 0%, #4a5159 100%);
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.15) inset;
  color: #e2e8f0;
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
