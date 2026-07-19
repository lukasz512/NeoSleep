<template>
  <div class="layout-public" :style="gradientAccentStyle">
    <main id="main-content" class="layout-public__main" role="main">
      <RouterView v-slot="{ Component }">
        <!-- No :key="route.path" here (unlike AppLayout): /login,
             /forgot-password and /reset-password intentionally share one
             component instance (see routes.ts) so its card/chrome never
             remounts between them — keying by path would force a remount on
             every one of those navigations and defeat that. Vue already
             remounts on its own when the component itself actually changes
             (e.g. → ChangePasswordView), so no key is needed either way. -->
        <Transition name="view-fade-lift" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<script setup lang="ts">
import { watch, onBeforeUnmount } from "vue";
import { useThemeStore } from "@stores";
import { brandColors } from "@brand/colors";

// Feeds brand teal into the animated gradient below (see .layout-public in
// <style>) so it tracks packages/brand/colors.ts instead of hardcoded hex
// duplicated here.
const gradientAccentStyle = {
  "--layout-public-primary": brandColors.primary,
  "--layout-public-primary-light": brandColors.primaryLight,
  "--layout-public-primary-dark": brandColors.primaryDark,
  "--layout-public-primary-on-dark": brandColors.primaryOnDark,
};

// Tints the iOS Safari toolbar (and, if the app is added to the home screen,
// the surrounding status-bar area) to match this layout's own background —
// see .layout-public below, same two hex values. Scoped to this layout via
// mount/unmount so app-layout routes aren't affected by a leftover tag.
const THEME_COLOR = { light: "#e8f5f4", dark: "#111111" } as const;

const themeStore = useThemeStore();
let metaEl: HTMLMetaElement | null = null;

watch(
  () => themeStore.mode,
  (mode) => {
    if (typeof document === "undefined") return;
    if (!metaEl) {
      metaEl = document.createElement("meta");
      metaEl.setAttribute("name", "theme-color");
      document.head.appendChild(metaEl);
    }
    metaEl.setAttribute("content", THEME_COLOR[mode]);
  },
  { immediate: true, flush: "sync" },
);

onBeforeUnmount(() => {
  metaEl?.remove();
  metaEl = null;
});
</script>

<style scoped>
.layout-public {
  height: 100dvh;
  overflow: hidden;
  box-sizing: border-box;
  padding: 16px;
  /* Outermost element for the auth shell (login, change-password) — the tinted
     surface lives here, not on the individual view, so it fills edge-to-edge
     with no default-bg margin showing around it.
     Gradient stops: page tint → the same pastel green as the fluid cursor
     trail (fluidSimulation.ts's fixed display color, #b8edcc) → brand teal
     → back to the page tint, so it loops seamlessly as background-position
     animates. Oversized (400% 400%) so the sweep reads as a slow, soft
     drift, not a visible edge-to-edge wipe. */
  background: linear-gradient(
    120deg,
    #e8f5f4,
    #b8edcc,
    var(--layout-public-primary-light, #8ed6ce),
    var(--layout-public-primary, #128f83),
    #e8f5f4
  );
  background-size: 400% 400%;
  animation: layout-public-flow 26s ease-in-out infinite;
}

:root[data-theme="dark"] .layout-public {
  background: linear-gradient(
    120deg,
    #111111,
    var(--layout-public-primary-dark, #082a27),
    var(--layout-public-primary-on-dark, #17b5a5),
    var(--layout-public-primary-dark, #082a27),
    #111111
  );
  background-size: 400% 400%;
}

@keyframes layout-public-flow {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .layout-public {
    animation: none;
  }
}

.layout-public__main {
  display: block;
  height: 100%;
  outline: none;
}
</style>
