<template>
  <div class="layout-public" :style="gradientAccentStyle">
    <!-- Spreads out from under the orbs as a single unit on mount (see bgVisible below) and
         dissolves again as part of the backdrop's playExit — the two layers
         inside keep their own tuned opacities (see .layout-public__bg-image/
         -gradient) untouched; this wrapper's opacity just multiplies on top,
         so entrance/exit never has to duplicate those per-theme values. -->
    <div
      class="layout-public__bg"
      :class="{
        'layout-public__bg--visible': bgVisible,
        'layout-public__bg--dissolving': bgDissolving,
      }"
    >
      <div
        class="layout-public__bg-image"
        aria-hidden="true"
        :style="{ backgroundImage: `url(${authBackgroundUrl})` }"
      />
      <div class="layout-public__bg-gradient" aria-hidden="true" />
    </div>
    <!-- Above the background, below the routed view (.layout-public__main,
         z-index 1). Owned here rather than by AuthView so the orbs are on
         screen from the first paint, together with the background — also
         while the router is still resolving the session (see backdropBusy). -->
    <AuthOrbs ref="orbsRef" :busy="backdropBusy" :anchor="orbsAnchor" :instant="orbsInstant" />
    <main id="main-content" class="layout-public__main" role="main">
      <RouterView v-slot="{ Component, route: viewRoute }">
        <!-- No :key="route.path" here (unlike AppLayout): /login,
             /forgot-password and /reset-password intentionally share one
             component instance (see routes.ts) so its card/chrome never
             remounts between them — keying by path would force a remount on
             every one of those navigations and defeat that. Vue already
             remounts on its own when the component itself actually changes
             (e.g. → ChangePasswordView), so no key is needed either way. -->
        <!-- An app route never renders here: while App.vue holds this layout
             for the exit (see exitToApp), the app view must not show through
             the dissolving backdrop — AppLayout renders it once the swap happens. -->
        <Transition name="view-fade-lift" mode="out-in">
          <component :is="Component" v-if="viewRoute.meta.layout !== 'app'" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick, provide } from "vue";
import { useRouter } from "vue-router";
import { useThemeStore } from "@stores";
import { brandColors } from "@brand/colors";
import { BRAND_AUTH_BACKGROUND_URL } from "@brand/logos";
import { AuthOrbs, AUTH_BACKDROP_KEY, type AuthBackdrop } from "@ui";
import { useAuthStore } from "../stores/auth";
import { bootedWithSplash, whenSplashLifts, whenSplashGone } from "../boot/bootSplash";

const authBackgroundUrl = BRAND_AUTH_BACKGROUND_URL;

// Fades the background (photo + gradient, see .layout-public__bg) in on
// mount. On exit it dissolves (fade + slight swell + blur) in the same beat as
// the orbs growing toward the viewer and melting (AuthOrbs' playExit), so the orbs
// read as pulling the whole canvas away with them — all before router.push
// swaps this layout for AppLayout (see App.vue), which has no transition of
// its own.
const BG_DISSOLVE_DURATION = 1400;

// The static HTML boot splash (src/boot/splash.ts) already painted this exact
// backdrop before any JS ran. Taking over from it, the background starts fully
// visible and the orbs start at rest — no second fade/pop-in — and the splash
// crossfades away on top once this layout has rendered underneath it.
const takingOverFromSplash = bootedWithSplash();
const bgVisible = ref(takingOverFromSplash);
const bgDissolving = ref(false);
const orbsInstant = ref(takingOverFromSplash);
const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Intro (mirrors the exit): plain ground, the orbs pop in (AuthOrbs), then the
// background spreads out from underneath them — see .layout-public__bg. The
// boot splash plays the identical intro in pure CSS before JS runs; taking over
// from it, all of this has already happened.
const BG_REVEAL_DELAY = 250;
const BG_REVEAL_DURATION = 1100;

let resolveBgRevealed: () => void = () => {};
const bgRevealed = new Promise<void>((resolve) => {
  resolveBgRevealed = resolve;
});

onMounted(async () => {
  if (takingOverFromSplash || prefersReducedMotion) {
    bgVisible.value = true;
    resolveBgRevealed();
    return;
  }
  await nextTick();
  await wait(BG_REVEAL_DELAY);
  bgVisible.value = true;
  await wait(BG_REVEAL_DURATION);
  resolveBgRevealed();
});

async function dissolveBackground(): Promise<void> {
  bgDissolving.value = true;
  if (prefersReducedMotion) return;
  await wait(BG_DISSOLVE_DURATION);
}

// ── Shared auth backdrop (see AuthBackdrop in packages/ui) ──────────────────
const orbsRef = ref<InstanceType<typeof AuthOrbs> | null>(null);
const orbsAnchor = ref<HTMLElement | null>(null);

// The initial navigation (session check in the router guard + the lazy view
// chunk) is already in flight when this layout mounts — App.vue renders it
// for the router's start location — so the orbs breathe "busy" until it
// settles, then views report their own loading via setBusy.
const router = useRouter();
const routerReady = ref(false);
void router.isReady().then(() => {
  routerReady.value = true;
});

// Also busy while the session check keeps running in the background after the
// router stopped waiting for it (SESSION_CHECK_BUDGET_MS in router/index.ts).
const auth = useAuthStore();
const busySources = reactive(new Set<string>());
const backdropBusy = computed(
  () => !routerReady.value || auth.sessionChecking || busySources.size > 0,
);

let backdropExited = false;

const backdrop: AuthBackdrop = {
  setBusy(source, busy) {
    if (busy) busySources.add(source);
    else busySources.delete(source);
  },
  registerAnchor(el) {
    orbsAnchor.value = el;
  },
  // The card zooms out of the orbs only once the whole intro has played —
  // orbs in, background revealed, boot splash (if any) lifting off.
  whenEntered: () =>
    Promise.all([orbsRef.value?.whenEntered(), bgRevealed, whenSplashLifts()]).then(() => undefined),
  async playExit() {
    backdropExited = true;
    await Promise.all([orbsRef.value?.playExit(), dissolveBackground()]);
  },
};

provide(AUTH_BACKDROP_KEY, backdrop);

/**
 * Called by App.vue right before it swaps this layout for AppLayout. After a
 * sign-in the exit has already played (AuthView runs playExitSequence before
 * router.push); on a page refresh with a live session it hasn't — the session
 * check just resolves and the app route arrives. Play the same exit here then,
 * once the boot splash is fully gone, so a refresh ends exactly like a login
 * instead of the backdrop cutting straight to a bare page.
 */
async function exitToApp(): Promise<void> {
  if (backdropExited) return;
  await whenSplashGone();
  if (backdropExited) return;
  await backdrop.playExit();
}

defineExpose({ exitToApp });

// A post-login exit normally ends with App.vue swapping this layout out for
// AppLayout. When the next route is public too (forced password change), this
// layout stays mounted — bring the background and orbs back instead of
// leaving the next view on a bare page.
watch(
  () => router.currentRoute.value.path,
  () => {
    if (!backdropExited || router.currentRoute.value.meta.layout !== "public") return;
    backdropExited = false;
    bgDissolving.value = false;
    orbsInstant.value = false;
    void orbsRef.value?.replay();
  },
);

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
  /* Revealed as .layout-public__bg dissolves on exit (see
     dissolveBackground) — the background doesn't just go transparent onto
     whatever happens to sit behind this layout, it deliberately washes to
     the app's own page color (white / near-black per theme) before the app
     underneath takes over. */
  background: rgb(var(--v-theme-background, 255, 255, 255));
  /* env(safe-area-inset-*) needs viewport-fit=cover on the <meta viewport>
     tag (see index.html) to be non-zero at all — without it iOS Safari never
     lets the page extend under the notch/home-indicator in the first place,
     so this padding would just resolve to the 16px fallback everywhere. With
     it, .layout-public__bg (a sibling, absolutely positioned, ignoring this
     padding) still bleeds all the way to the true screen edges — only the
     card/logo content below gets pushed clear of the hardware cutouts. */
  /* Exposed as variables so a view that scrolls itself (PartnerRegistrationView)
     can extend its scroller under this frame — otherwise a wheel/swipe that
     starts in the 16px band around the card scrolls nothing. */
  --layout-public-inset-top: max(16px, env(safe-area-inset-top));
  --layout-public-inset-right: max(16px, env(safe-area-inset-right));
  --layout-public-inset-bottom: max(16px, env(safe-area-inset-bottom));
  --layout-public-inset-left: max(16px, env(safe-area-inset-left));
  padding: var(--layout-public-inset-top) var(--layout-public-inset-right) var(--layout-public-inset-bottom)
    var(--layout-public-inset-left);
}

/* Wraps both layers below — fades in on mount and dissolves via
   dissolveBackground (see script), so entrance/exit is one transition here
   rather than duplicated across the image and gradient's own already-tuned
   opacities. */
/* Entrance: spreads out from underneath the orbs — a circle growing from the
   orb cluster's center (--layout-public-orbs-y, same geometry as AuthOrbs'
   default frame and the boot splash) — instead of a flat fade-in. */
.layout-public__bg {
  --layout-public-orbs-y: calc(max(16px, env(safe-area-inset-top)) + clamp(24px, 10vh, 96px) + 115px + 220px);
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0;
  clip-path: circle(0px at 50% var(--layout-public-orbs-y));
  transition:
    clip-path 1.1s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.4s ease-out;
}

.layout-public__bg--visible {
  opacity: 1;
  clip-path: circle(150vmax at 50% var(--layout-public-orbs-y));
}

/* "Rozpływa się" — melts rather than cuts: fades while swelling slightly and
   going soft-focus, over the same 1.4s the orbs take to grow past the
   screen edges (AuthOrbs), so the two read as one motion. */
.layout-public__bg--dissolving {
  opacity: 0;
  transform: scale(1.06);
  filter: blur(14px);
  transition:
    opacity 1.4s cubic-bezier(0.4, 0, 0.2, 1),
    transform 1.4s cubic-bezier(0.4, 0, 0.2, 1),
    filter 1.4s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .layout-public__bg,
  .layout-public__bg--dissolving {
    transform: none;
    filter: none;
    clip-path: none;
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
