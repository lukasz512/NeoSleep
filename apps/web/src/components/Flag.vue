<template>
  <span
    class="flag-icon"
    :style="{ fontSize: size + 'px', lineHeight: 1 }"
    :aria-label="label"
    role="img"
  >{{ emoji }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{
  code: string;
  size?: number;
}>(), { size: 16 });

// Regional indicator symbols: 0x1F1E6 = 🇦
const FLAG_OFFSET = 0x1F1E6 - 65; // 'A'.charCodeAt(0) = 65

const emoji = computed(() => {
  const upper = props.code.toUpperCase().slice(0, 2);
  return Array.from(upper)
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + FLAG_OFFSET))
    .join("");
});

const LABELS: Record<string, string> = {
  MX: "México", PL: "Poland", TH: "Thailand", US: "United States",
  ES: "España", GB: "United Kingdom", DE: "Germany", FR: "France",
};
const label = computed(() => LABELS[props.code.toUpperCase()] ?? props.code);
</script>
