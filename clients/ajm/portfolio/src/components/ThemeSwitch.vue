<!-- Light / dark switch. The icon is a disc whose shadow slides across it (full sun ↔ crescent).
     The change is the art: the new theme opens as a circle from this button and sweeps across the
     page (View Transitions). Browsers without them, and lite mode, get a short colour crossfade. -->
<template>
  <button
    ref="btn"
    type="button"
    class="sw"
    :class="{ 'sw--dark': theme === 'dark' }"
    :aria-label="theme === 'dark' ? t('nav.themeToLight') : t('nav.themeToDark')"
    :aria-pressed="theme === 'dark'"
    @click="toggle"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <mask :id="maskId">
        <rect width="24" height="24" fill="white" />
        <circle class="sw__shadow" cx="24" cy="4" r="8" fill="black" />
      </mask>
      <circle cx="12" cy="12" r="7" fill="currentColor" :mask="`url(#${maskId})`" />
      <g class="sw__rays" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <line x1="12" y1="1.5" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="22.5" />
        <line x1="1.5" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="22.5" y2="12" />
      </g>
    </svg>
  </button>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { applyTheme, revealRadius, storeTheme, type Theme } from "../lib/theme";

const props = defineProps<{ lite: boolean }>();
const { t } = useI18n();
const btn = ref<HTMLButtonElement | null>(null);
const maskId = `ajm-sw-${Math.random().toString(36).slice(2, 8)}`;
const theme = ref<Theme>(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function set(next: Theme) {
  theme.value = next;
  applyTheme(next);
  storeTheme(next);
}

function toggle() {
  const next: Theme = theme.value === "dark" ? "light" : "dark";
  const root = document.documentElement;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };

  if (props.lite || !doc.startViewTransition) {
    root.classList.add("theme-fade");
    set(next);
    window.setTimeout(() => root.classList.remove("theme-fade"), 650);
    return;
  }
  const r = btn.value?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : window.innerWidth;
  const y = r ? r.top + r.height / 2 : 0;
  root.style.setProperty("--ajm-tx", `${x}px`);
  root.style.setProperty("--ajm-ty", `${y}px`);
  root.style.setProperty("--ajm-tr", `${revealRadius(x, y, window.innerWidth, window.innerHeight)}px`);
  doc.startViewTransition(() => set(next));
}
</script>

<style scoped>
.sw {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
}
.sw svg {
  width: 20px;
  height: 20px;
  overflow: visible;
}
.sw__shadow {
  transition: transform 0.7s var(--ajm-ease);
}
.sw__rays {
  transform-origin: 12px 12px;
  transition:
    transform 0.7s var(--ajm-ease),
    opacity 0.4s ease;
}
/* dark: the shadow slides over the disc into a crescent, the rays fold away */
.sw--dark .sw__shadow {
  transform: translate(-7px, 3px);
}
.sw--dark .sw__rays {
  transform: rotate(45deg) scale(0.6);
  opacity: 0;
}
</style>
