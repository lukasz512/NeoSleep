<template>
  <div class="theme-toggle">
    <button
      ref="btnRef"
      type="button"
      class="theme-toggle__btn"
      :aria-label="toggleLabel"
      :title="toggleLabel"
      @click="onClick"
    >
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
import { useTheme } from "../composables/useTheme";

const { t } = useI18n();
const { isDark, toggle } = useTheme();

const btnRef = ref<HTMLElement | null>(null);
const waveRef = ref<HTMLElement | null>(null);
const waveActive = ref(false);
const waveExpand = ref(false);
const waveTargetDark = ref(false);
const waveOrigin = ref({ x: 0, y: 0 });

const toggleLabel = computed(() => t("website.theme.toggleLabel"));

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
  const rect = btn.getBoundingClientRect();
  waveOrigin.value = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  waveTargetDark.value = !isDark.value;
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
  toggle();
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
  border: 2px solid var(--website-border);
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

/* Light theme: show sun */
:root:not([data-theme="dark"]) .theme-toggle__icon--sun {
  opacity: 1;
  transform: scale(1);
}

/* Dark theme: show moon */
[data-theme="dark"] .theme-toggle__icon--moon {
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
