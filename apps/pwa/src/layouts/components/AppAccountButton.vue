<template>
  <AppButton
    variant="text"
    class="layout-user-btn"
    ignore-global-loading
    :class="{ 'layout-user-btn--compact': compact }"
    :title="label"
    :aria-label="label"
    aria-haspopup="dialog"
    :aria-expanded="expanded"
  >
    <div v-if="!compact" class="layout-user-info">
      <span class="layout-user-name" data-motion="trigger-name">{{ name }}</span>
      <span class="layout-user-role" data-motion="trigger-role">{{ roleLabel }}</span>
    </div>
    <!-- CORE-114: the role badge rides on the app bar avatar too. -->
    <AppAvatar
      class="layout-user-avatar"
      :name="name"
      entity-type="user"
      :role="role"
      :role-label="roleLabel"
      :size="avatarSize"
      data-motion="trigger-avatar"
    />
  </AppButton>
</template>

<script setup lang="ts">
/**
 * The account button at the top right of the app bar (NEO-55): name + role
 * on desktop, the avatar with its role badge (CORE-114) everywhere. It is the
 * trigger AppAccountMenu grows its card out of — the data-motion marks are
 * what that motion reads. Its own component (CORE-131) so the e2e harness can
 * render the real button, focus style included.
 *
 * Sizing/padding against the shell lives in AppLayout (it needs the layout's
 * tokens); this file owns the button's own look.
 */
import AppButton from "../../components/AppButton.vue";
import AppAvatar from "../../components/AppAvatar.vue";

withDefaults(
  defineProps<{
    name: string;
    roleLabel: string;
    /** users.role code — picks the avatar's role badge. */
    role?: string | null;
    /** Phone: avatar only, no name/role. */
    compact?: boolean;
    /** Accessible name / tooltip ("User menu"). */
    label: string;
    /** Whether the account menu is open (aria-expanded). */
    expanded?: boolean;
    avatarSize?: number;
  }>(),
  { role: null, compact: false, expanded: false, avatarSize: 32 },
);
</script>

<style scoped>
/* Static sizing only — no hover/focus size change (two earlier animated
   attempts both read as broken); hover feedback is Vuetify's own text-button
   overlay. */
.layout-user-btn {
  height: auto !important;
  min-height: 44px;
  text-transform: none;
  letter-spacing: normal;
  border-radius: 999px;
  /* CORE-131: VBtn clips everything outside the button (overflow: hidden),
     which cut the avatar's role badge off at its corner. The hover/focus
     overlay is rounded with the button itself, so nothing else spills. */
  overflow: visible !important;
  /* Only the focus tint below fades; the size never animates. */
  transition: background-color 160ms ease;
}

/* CORE-131 focus (decision form core-114-account-focus-r1, variant C):
   keyboard focus tints the pill like hover and draws a brand ring around the
   avatar — not the global outline around the whole pill. Mouse clicks and
   taps never match :focus-visible, so they show neither. */
.layout-user-btn:focus-visible {
  outline: none;
  background-color: rgba(var(--v-theme-primary), 0.12);
}

/* Vuetify's hover/focus overlay relied on that clipping for its round
   shape; give it the pill's radius itself. */
.layout-user-btn :deep(.v-btn__overlay),
.layout-user-btn :deep(.v-btn__underlay) {
  border-radius: inherit;
}

/* Vuetify's own focus marks (a grey overlay and a currentColor ring on
   ::after) would sit on top of the brand tint — focus is only ours here. */
.layout-user-btn:focus-visible :deep(> .v-btn__overlay),
.layout-user-btn:focus-visible::after {
  opacity: 0;
}

/* The ring is always there, faded out, so it can animate both ways. It sits
   under the badge (z-index 2 in AppAvatar), whose surface-colored edge
   separates the two. */
.layout-user-avatar::after {
  content: "";
  position: absolute;
  inset: -5px;
  z-index: 1;
  border-radius: 50%;
  border: 2px solid rgb(var(--v-theme-primary));
  opacity: 0;
  transform: scale(0.82);
  transition:
    opacity 160ms ease,
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}

.layout-user-btn:focus-visible .layout-user-avatar::after {
  opacity: 1;
  transform: scale(1);
}

@media (prefers-reduced-motion: reduce) {
  .layout-user-btn,
  .layout-user-avatar::after {
    transition: none;
  }
}

.layout-user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  min-width: 0;
  margin-inline-end: 10px;
}

.layout-user-name {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.layout-user-role {
  font-size: 0.7rem;
  font-weight: 400;
  line-height: 1.2;
  opacity: var(--v-medium-emphasis-opacity);
  white-space: nowrap;
}
</style>
