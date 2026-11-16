<template>
  <span v-if="dotOnly" class="work-label-dot" :class="`work-label--${tone}`" role="img" :title="name" :aria-label="name">
    <span class="work-label__dot" aria-hidden="true" />
  </span>
  <component
    :is="clickable ? 'button' : 'span'"
    v-else
    :type="clickable ? 'button' : undefined"
    class="work-label"
    :class="[`work-label--${tone}`, { 'work-label--active': active, 'work-label--clickable': clickable, 'work-label--small': small }]"
    :aria-pressed="clickable ? active : undefined"
  >
    <slot name="icon"><span class="work-label__dot" aria-hidden="true" /></slot>
    <span class="work-label__name">{{ name }}</span>
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useWorkBoardContext } from "./workBoardContext";
import type { WorkLabelColor } from "../../types/workBoard";

/**
 * One label (CORE-219): a dot in the catalog's colour on a tint of it, the name in the normal
 * text colour so it reads in both themes. `clickable` makes it a toggle button (the filter row,
 * a card's chips). Without `color` the colour comes from the board's catalog. `primary` is for
 * the chips that are not labels (the sessions filter), which bring their own icon. `dotOnly` is
 * the compact card's version: the dot alone, the name as its accessible name.
 */
const props = defineProps<{
  name: string;
  color?: WorkLabelColor | "primary";
  active?: boolean;
  clickable?: boolean;
  small?: boolean;
  dotOnly?: boolean;
}>();
const board = useWorkBoardContext();
const tone = computed(() => props.color ?? board.colors.value[props.name.toLowerCase()] ?? "none");
</script>

<style scoped>
.work-label {
  --work-label: var(--v-theme-on-surface);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 28px;
  padding: 0 10px;
  font: inherit;
  font-size: 0.8125rem;
  line-height: 1;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--work-label), 0.12);
  border: 1px solid transparent;
  border-radius: 999px;
}

.work-label-dot {
  --work-label: var(--v-theme-on-surface);
  display: inline-flex;
}

.work-label--small {
  gap: 4px;
  min-height: 20px;
  padding: 0 8px;
  font-size: 0.75rem;
}

.work-label--clickable {
  cursor: pointer;
}

.work-label--clickable:hover {
  background: rgba(var(--work-label), 0.2);
}

.work-label--clickable:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.work-label--active {
  background: rgba(var(--work-label), 0.24);
  border-color: rgb(var(--work-label));
}

.work-label__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--work-label));
}

.work-label--none .work-label__dot {
  background: rgba(var(--work-label), 0.4);
}

.work-label__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-label--primary {
  --work-label: var(--v-theme-primary);
}

.work-label--blue {
  --work-label: 30, 136, 229;
}

.work-label--teal {
  --work-label: 0, 150, 136;
}

.work-label--green {
  --work-label: 67, 160, 71;
}

.work-label--amber {
  --work-label: 245, 166, 0;
}

.work-label--orange {
  --work-label: 245, 124, 0;
}

.work-label--red {
  --work-label: 229, 57, 53;
}

.work-label--pink {
  --work-label: 216, 27, 96;
}

.work-label--purple {
  --work-label: 142, 68, 173;
}
</style>
