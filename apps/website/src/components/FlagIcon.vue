<template>
  <span class="flag-icon" :class="`flag-icon--${locale}`" aria-hidden="true">
    <!-- UK (EN): simplified flat Union Jack -->
    <svg v-if="locale === 'en'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" class="flag-icon__svg">
      <rect width="30" height="20" fill="#012169"/>
      <path fill="#fff" d="M0 0l30 20M30 0L0 20" stroke="#fff" stroke-width="4"/>
      <path fill="#C8102E" d="M15 0v20M0 10h30" stroke="#C8102E" stroke-width="2"/>
      <path fill="#C8102E" d="M0 0l30 20M30 0L0 20" stroke="#C8102E" stroke-width="1.2"/>
    </svg>
    <!-- PL: white over red -->
    <svg v-else-if="locale === 'pl'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" class="flag-icon__svg">
      <rect width="30" height="20" fill="#dc143c"/>
      <rect width="30" height="10" fill="#fff"/>
    </svg>
    <!-- ES: red-yellow-red -->
    <svg v-else-if="locale === 'es'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" class="flag-icon__svg">
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

const fallbackEmoji = { en: "🇬🇧", pl: "🇵🇱", es: "🇪🇸" }[props.locale] ?? "🏳";
</script>

<style lang="scss" scoped>
.flag-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #9ca3af;
}

.flag-icon__svg {
  display: block;
  width: 24px;
  height: 16px;
  object-fit: cover;
}

.flag-icon__fallback {
  font-size: 1rem;
  line-height: 1;
}
</style>
