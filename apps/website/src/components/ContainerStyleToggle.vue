<template>
  <NavTooltip :text="toggleLabel">
    <button
      type="button"
      class="container-style-toggle__btn"
      :aria-label="toggleLabel"
      :title="toggleLabel"
      :data-style="containerStyle"
      @click="toggleContainerStyle"
    >
      <span class="container-style-toggle__icon container-style-toggle__icon--wide" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="1" />
          <path d="M2 8h20" />
        </svg>
      </span>
      <span class="container-style-toggle__icon container-style-toggle__icon--compact" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="1" />
          <path d="M4 9h16" />
        </svg>
      </span>
    </button>
  </NavTooltip>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed } from "vue";
import NavTooltip from "./NavTooltip.vue";
import { useContainerStyle } from "../composables/useContainerStyle";

const { t } = useI18n();
const { containerStyle, toggleContainerStyle } = useContainerStyle();

const toggleLabel = computed(() =>
  containerStyle.value === "wide"
    ? t("website.layout.containerSwitchToCompact")
    : t("website.layout.containerSwitchToWide")
);
</script>

<style lang="scss" scoped>
.container-style-toggle__btn {
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
}

.container-style-toggle__icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.25s ease;

  svg {
    width: 22px;
    height: 22px;
  }
}

.container-style-toggle__btn[data-style="wide"] .container-style-toggle__icon--wide {
  opacity: 1;
}

.container-style-toggle__btn[data-style="compact"] .container-style-toggle__icon--compact {
  opacity: 1;
}
</style>
