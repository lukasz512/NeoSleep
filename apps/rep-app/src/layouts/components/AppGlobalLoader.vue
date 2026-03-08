<template>
  <!-- Wrapper always in layout (fixed height) so showing the bar never causes reflow. -->
  <div
    class="layout-app__loader"
    role="status"
    aria-live="polite"
    :aria-label="loaderLabel"
    :aria-hidden="!active"
  >
    <div v-show="active" class="layout-app__loader-track" aria-hidden="true">
      <div class="layout-app__loader-bar" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

defineProps<{
  active: boolean;
}>();

const { t } = useI18n();
const loaderLabel = computed(() => t("layout.loader.label"));
</script>

<style lang="scss" scoped>
.layout-app__loader {
  height: 3px;
  min-height: 3px;
  max-height: 3px;
  margin: 0 var(--rep-content-padding-x, 16px);
  overflow: hidden;
  flex-shrink: 0;
  flex-grow: 0;
  box-sizing: border-box;
  border-radius: var(--rep-radius-sm, 2px);
}

.layout-app__loader-track {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
  border-radius: var(--rep-radius-sm, 2px);
  background: rgba(var(--v-theme-primary), 0.12);
}

.layout-app__loader-bar {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 40%;
  border-radius: var(--rep-radius-sm, 2px);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgb(var(--v-theme-primary)) 30%,
    rgb(var(--v-theme-primary)) 70%,
    transparent 100%
  );
  animation: rep-loader-shimmer 1.4s ease-in-out infinite;
}

@keyframes rep-loader-shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(350%);
  }
}
</style>
