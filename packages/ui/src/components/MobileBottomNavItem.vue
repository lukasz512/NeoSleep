<template>
  <RouterLink v-slot="{ navigate, isActive, href }" :to="to" custom>
    <a
      :href="href"
      class="mobile-bottom-nav-item"
      :class="{ 'mobile-bottom-nav-item--active': isActive, 'mobile-bottom-nav-item--label': showLabel }"
      :aria-label="showLabel ? undefined : label"
      @click="onClick($event, navigate)"
    >
      <span class="mobile-bottom-nav-item__icon" aria-hidden="true"><slot /></span>
      <span class="mobile-bottom-nav-item__label">{{ label }}</span>
    </a>
  </RouterLink>
</template>

<script setup lang="ts">
/**
 * Shared bottom-nav item (packages/ui) — icon + label, active/hover/focus
 * states. Ported from apps/web's MobileNavLink, which already had the feel
 * right; apps/pwa's bottom nav now uses this too instead of Vuetify's own
 * VBtn, so both apps share one look. Label is always in the DOM (screen
 * readers) but visually hidden by default — pass show-label to keep it
 * visible (apps/pwa wants labels; apps/web keeps its icon-only look).
 *
 * @click fires before navigation — call preventDefault() on the event to
 * override the default RouterLink navigate (e.g. apps/web's "tap the
 * already-active item to scroll to top" behavior).
 */
withDefaults(
  defineProps<{
    to: string;
    label: string;
    showLabel?: boolean;
  }>(),
  { showLabel: false },
);

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

function onClick(event: MouseEvent, navigate: (e: MouseEvent) => void) {
  emit("click", event);
  if (!event.defaultPrevented) navigate(event);
}
</script>

<style scoped>
.mobile-bottom-nav-item {
  flex: 0 1 89px;
  min-width: 55px;
  max-width: 89px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: var(--mobile-bottom-nav-item-color, #666);
  cursor: pointer;
  text-decoration: none;
  font-family: inherit;
  transition: color 0.2s;
  -webkit-tap-highlight-color: transparent;
}

.mobile-bottom-nav-item--active,
.mobile-bottom-nav-item:hover {
  color: var(--mobile-bottom-nav-item-active-color, #1976d2);
}

.mobile-bottom-nav-item:focus-visible {
  outline: 2px solid var(--mobile-bottom-nav-item-active-color, #1976d2);
  outline-offset: -2px;
  border-radius: 8px;
}

.mobile-bottom-nav-item__icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
}

.mobile-bottom-nav-item__icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.mobile-bottom-nav-item__label {
  display: none;
  font-size: 0.6875rem;
}

.mobile-bottom-nav-item--label .mobile-bottom-nav-item__label {
  display: block;
}
</style>
