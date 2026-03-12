<template>
  <span class="flag-icon" :class="`flag-icon--${locale}`" aria-hidden="true">
    <!-- UK (EN): Union Jack – czytelna wersja 3:2 -->
    <svg v-if="locale === 'en'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" class="flag-icon__svg">
      <rect width="60" height="40" fill="#012169"/>
      <path fill="#fff" d="M0 0 L60 40 L57 40 L0 2.5 Z M60 0 L0 40 L0 37.5 L60 0 Z"/>
      <rect x="24" y="0" width="12" height="40" fill="#fff"/>
      <rect x="0" y="14" width="60" height="12" fill="#fff"/>
      <rect x="27" y="0" width="6" height="40" fill="#C8102E"/>
      <rect x="0" y="17" width="60" height="6" fill="#C8102E"/>
      <path fill="#fff" d="M26 0 L34 0 L60 26 L60 34 L34 8 L26 8 L0 34 L0 26 Z M26 40 L34 40 L8 14 L0 14 L0 6 L8 6 L34 32 L26 32 L60 6 L60 14 Z"/>
      <path fill="#C8102E" d="M29 0 L31 0 L60 29 L60 31 L31 2 L29 2 L0 31 L0 29 Z M29 40 L31 40 L2 11 L0 11 L0 9 L2 9 L31 38 L29 38 L58 9 L60 9 L60 11 L58 11 Z"/>
    </svg>
    <!-- PL: white over red -->
    <svg v-else-if="locale === 'pl'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice" class="flag-icon__svg">
      <rect width="30" height="20" fill="#dc143c"/>
      <rect width="30" height="10" fill="#fff"/>
    </svg>
    <!-- ES: red-yellow-red -->
    <svg v-else-if="locale === 'es'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice" class="flag-icon__svg">
      <rect width="30" height="20" fill="#c60b1e"/>
      <rect y="5" width="30" height="10" fill="#ffc400"/>
    </svg>
    <span v-else class="flag-icon__fallback">{{ fallbackEmoji }}</span>
  </span>
</template>

<script setup lang="ts">
import type { LocaleId } from "@i18n/language-options";

const props = withDefaults(
  defineProps<{ locale: LocaleId }>(),
  {}
);

const fallbackEmoji = { en: "🇺🇸", pl: "🇵🇱", es: "🇪🇸" }[props.locale] ?? "🏳";
</script>

<style lang="scss" scoped>
.flag-icon {
  display: inline-flex;
  align-items: stretch;
  justify-content: stretch;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-sizing: border-box;
  padding: 0;
  line-height: 0;
}

.flag-icon__svg {
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  vertical-align: top;
}

.flag-icon__fallback {
  font-size: 1rem;
  line-height: 1;
}
</style>
