<template>
  <div class="layout-public" :style="gradientAccentStyle">
    <!-- Fades in as a single unit on mount (see bgVisible/playEnter below) and
         fades out again via the injected playExit — the two layers inside
         keep their own tuned opacities (see .layout-public__bg-image/
         -gradient) untouched; this wrapper's opacity just multiplies on top,
         so entrance/exit never has to duplicate those per-theme values. -->
    <div class="layout-public__bg" :class="{ 'layout-public__bg--visible': bgVisible }">
      <div
        class="layout-public__bg-image"
        aria-hidden="true"
        :style="{ backgroundImage: `url(${authBackgroundUrl})` }"
      />
      <div class="layout-public__bg-gradient" aria-hidden="true" />
    </div>
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
import { ref, watch, onMounted, onBeforeUnmount, nextTick, provide } from "vue";
import { useThemeStore } from "@stores";
import { brandColors } from "@brand/colors";
import { BRAND_AUTH_BACKGROUND_URL } from "@brand/logos";
import { AUTH_BACKGROUND_EXIT_KEY } from "@ui";

const authBackgroundUrl = BRAND_AUTH_BACKGROUND_URL;

// Fades the background (photo + gradient, see .layout-public__bg) in on
// mount and exposes playExit so AuthView can fade it back out as part of its
// own post-login exit sequence, before router.push actually swaps this whole
// layout for AppLayout (see App.vue) — that swap has no transition of its
// own, so without this the background would just vanish instantly under the
// fading card/logo/orbs instead of fading with them.
const BG_EXIT_DURATION = 600;

const bgVisible = ref(false);
const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

onMounted(async () => {
  if (prefersReducedMotion) {
    bgVisible.value = true;
    return;
  }
  await nextTick();
  bgVisible.value = true;
});

async function playBackgroundExit(): Promise<void> {
  if (prefersReducedMotion) return;
  bgVisible.value = false;
  await wait(BG_EXIT_DURATION);
}

provide(AUTH_BACKGROUND_EXIT_KEY, playBackgroundExit);

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
  position: relative;
  height: 100dvh;
  overflow: hidden;
  box-sizing: border-box;
  /* Revealed as .layout-public__bg fades its own opacity out on exit (see
     playBackgroundExit) — the background doesn't just go transparent onto
     whatever happens to sit behind this layout, it deliberately washes to
     white before the app underneath takes over. */
  background: #fff;
  /* env(safe-area-inset-*) needs viewport-fit=cover on the <meta viewport>
     tag (see index.html) to be non-zero at all — without it iOS Safari never
     lets the page extend under the notch/home-indicator in the first place,
     so this padding would just resolve to the 16px fallback everywhere. With
     it, .layout-public__bg (a sibling, absolutely positioned, ignoring this
     padding) still bleeds all the way to the true screen edges — only the
     card/logo content below gets pushed clear of the hardware cutouts. */
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
}

/* Wraps both layers below — fades in on mount and out via playBackgroundExit
   (see script), so entrance/exit is one opacity transition here rather than
   duplicated across the image and gradient's own already-tuned opacities. */
.layout-public__bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0;
  transition: opacity 0.6s ease-out;
}

.layout-public__bg--visible {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .layout-public__bg {
    transition: none;
  }
}

/* Medical photo, furthest back — the animated gradient (see
   .layout-public__bg-gradient) sits on top of it at less than full opacity,
   so this shows through softly rather than sitting behind an opaque layer
   that would hide it entirely. Desaturated and slightly blurred so it reads
   as ambience, not a sharp stock photo competing with the card. Anchored to
   the right edge (not centered) so cover-cropping trims the left side and
   keeps the doctor/tablet subject intact on the right. */
.layout-public__bg-image {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: right center;
  filter: saturate(0.75) blur(1px);
  opacity: 0.75;
}

:root[data-theme="dark"] .layout-public__bg-image {
  /* Same photo reads as a bright, clashing rectangle on a near-black page at
     full brightness — desaturated and dimmed here rather than swapping in a
     second photo just for dark mode. Still noticeably lighter than the first
     pass at this (0.35/0.7), which nearly disappeared against the dark
     gradient on top of it. */
  opacity: 0.55;
  filter: saturate(0.65) brightness(0.9) blur(1px);
}

/* Outermost visual for the auth shell (login, change-password) — the tinted
   surface lives here, not on the individual view, so it fills edge-to-edge
   with no default-bg margin showing around it.
   Gradient stops: page tint → pastel mint → brand teal → back to the page
   tint, so it loops seamlessly as background-position animates. Oversized
   (400% 400%) so the sweep reads as a slow, soft drift, not a visible
   edge-to-edge wipe. Below full opacity (not 1) so .layout-public__bg-image
   underneath stays lightly visible through it. */
.layout-public__bg-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    120deg,
    #e8f5f4,
    #b8edcc,
    var(--layout-public-primary-light, #8ed6ce),
    var(--layout-public-primary, #128f83),
    #e8f5f4
  );
  background-size: 400% 400%;
  opacity: 0.72;
  /* linear, not ease-in-out: with only 0%/50%/100% keyframes, ease-in-out
     decelerated into 0% and 100% — the same background-position visited
     twice in a row — which read as a stutter at the loop point. Constant
     speed removes that. */
  animation: layout-public-flow 16s linear infinite;
}

:root[data-theme="dark"] .layout-public__bg-gradient {
  background: linear-gradient(
    120deg,
    #111111,
    var(--layout-public-primary-dark, #082a27),
    var(--layout-public-primary-on-dark, #17b5a5),
    var(--layout-public-primary-dark, #082a27),
    #111111
  );
  background-size: 400% 400%;
  opacity: 0.7;
}

/* A diagonal loop (not a straight left-right sweep) so the position drifts
   through more of the oversized gradient — richer color mixing along the
   way, not just two colors crossfading back and forth. */
@keyframes layout-public-flow {
  0% {
    background-position: 0% 50%;
  }
  25% {
    background-position: 50% 20%;
  }
  50% {
    background-position: 100% 50%;
  }
  75% {
    background-position: 50% 80%;
  }
  100% {
    background-position: 0% 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .layout-public__bg-gradient {
    animation: none;
  }
}

.layout-public__main {
  position: relative;
  z-index: 1;
  display: block;
  height: 100%;
  outline: none;
}
</style>
