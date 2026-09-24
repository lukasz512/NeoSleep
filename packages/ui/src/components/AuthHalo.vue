<template>
  <div
    class="auth-halo"
    :class="[`auth-halo--${size}`, { 'auth-halo--dark': dark }]"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
// Soft blurred shadow behind a piece of auth-screen branding (the login
// wordmark in AuthChrome, the PWA badge under the card in AuthView) — the dot
// field and orbs are busy enough that both need a bit of contrast lift to stay
// legible. Fills its positioned parent (inset: 0); the parent decides how far
// the halo bleeds past the element it sits behind.
withDefaults(
  defineProps<{
    dark?: boolean;
    /** "sm" is the same halo at half the blur, for smaller elements. */
    size?: "md" | "sm";
  }>(),
  {
    dark: false,
    size: "md",
  },
);
</script>

<style scoped>
.auth-halo {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.auth-halo--md {
  filter: blur(26px);
}

.auth-halo--sm {
  filter: blur(13px);
}

/* One layer per theme, crossfaded via opacity — a radial-gradient background
   itself can't be transitioned, so swapping it directly would snap instantly
   on theme toggle. Deliberately slower than the rest of the UI so the shadow
   visibly "sinks" into the new theme. */
.auth-halo::before,
.auth-halo::after {
  content: "";
  position: absolute;
  inset: 0;
  transition: opacity 1.2s ease-in-out;
}

.auth-halo::before {
  /* brandColors.primaryDark (#082A27) */
  background: radial-gradient(ellipse, rgba(8, 42, 39, 0.45) 0%, rgba(8, 42, 39, 0) 72%);
  opacity: 1;
}

.auth-halo::after {
  background: radial-gradient(ellipse, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0) 72%);
  opacity: 0;
}

.auth-halo--dark::before {
  opacity: 0;
}

.auth-halo--dark::after {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .auth-halo::before,
  .auth-halo::after {
    transition: none;
  }
}
</style>
