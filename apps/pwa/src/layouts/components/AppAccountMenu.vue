<template>
  <!-- NEO-122 / NEO-154 / NEO-161: the avatar button turns into the account
       menu. The glass card, its motion and the phone's swipe-to-close live in
       AppGlassPopover, shared with the notification bell (CORE-4). -->
  <AppGlassPopover v-model:open="open" :mobile="mobile" :label="label" test-id="account-menu">
    <template #trigger="slotProps">
      <slot name="trigger" v-bind="slotProps" />
    </template>
    <slot />
  </AppGlassPopover>
</template>

<script setup lang="ts">
import AppGlassPopover from "../../components/AppGlassPopover.vue";

defineProps<{
  /** Phone: the card spans the screen width (same motion as desktop). */
  mobile: boolean;
  /** Accessible name of the dialog. */
  label: string;
}>();

const open = defineModel<boolean>("open", { default: false });
</script>
