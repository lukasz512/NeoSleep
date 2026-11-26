<template>
  <!-- A real link (not a click handler): the whole OAuth flow is a top-level
       navigation to the API, which redirects on to Google. -->
  <VBtn
    :href="href"
    :loading="loading"
    :disabled="disabled"
    size="large"
    block
    variant="flat"
    class="google-sign-in-btn"
    :class="{ 'google-sign-in-btn--dark': dark }"
    data-testid="google-sign-in"
    @click="emit('start')"
  >
    <span class="google-sign-in-btn__content">
      <!-- Official Google "G" mark, unmodified (Google Identity branding
           guidelines: standard four colours, never recoloured). -->
      <svg
        class="google-sign-in-btn__logo"
        viewBox="0 0 48 48"
        width="20"
        height="20"
        aria-hidden="true"
        focusable="false"
      >
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      <span class="google-sign-in-btn__label">{{ label }}</span>
    </span>
  </VBtn>
</template>

<script setup lang="ts">
/**
 * "Sign in with Google" button (NEO-78), following Google's sign-in branding
 * guidelines (developers.google.com/identity/branding-guidelines): the
 * unmodified four-colour "G", Google's own wording (localized via i18n), and
 * Google's light / dark palettes, never the app's brand colour. Shape, height
 * and width match the app's primary sign-in VBtn so the two sit as a pair.
 */
defineProps<{
  href: string;
  label: string;
  dark?: boolean;
  loading?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{ start: [] }>();
</script>

<style scoped>
/* Google's light theme: white fill, #747775 1px stroke, #1F1F1F text. */
.google-sign-in-btn {
  background-color: #ffffff !important;
  color: #1f1f1f !important;
  border: 1px solid #747775;
  text-transform: none;
  letter-spacing: 0.25px;
  font-family: "Roboto", arial, sans-serif;
  font-weight: 500;
}

/* Google's dark theme: #131314 fill, #8E918F 1px stroke, #E3E3E3 text. */
.google-sign-in-btn--dark {
  background-color: #131314 !important;
  color: #e3e3e3 !important;
  border-color: #8e918f;
}

/* Same reasoning as AuthView's block submit: the app-wide hover/active scale
   reads as a broken zoom on a full-width button. */
.google-sign-in-btn:hover,
.google-sign-in-btn:active {
  transform: none !important;
}

.google-sign-in-btn__content {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.google-sign-in-btn__logo {
  flex: none;
  display: block;
}

.google-sign-in-btn__label {
  font-size: 0.95rem;
}
</style>
