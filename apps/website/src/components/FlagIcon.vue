<template>
  <Flag :code="countryCode" :size="18" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { LocaleId } from "@i18n/language-options";
import Flag from "./Flag.vue";
import { LOCALE_FLAG_CODE } from "../config/localeFlags";

const props = defineProps<{ locale: LocaleId }>();

const countryCode = computed(() => LOCALE_FLAG_CODE[props.locale] ?? props.locale);
</script>
