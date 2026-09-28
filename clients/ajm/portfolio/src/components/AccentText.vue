<!-- Renders headline markup from the locale files: [word] → Bodoni italic, {phrase} → sand marker. -->
<template>
  <template v-for="(s, i) in segments" :key="i">
    <span v-if="s.acc || s.mk" :class="{ acc: s.acc, mk: s.mk }">{{ s.text }}</span>
    <template v-else>{{ s.text }}</template>
  </template>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { parseAccent } from "../lib/accent";

const props = defineProps<{ text: string }>();
const segments = computed(() => parseAccent(props.text));
</script>
