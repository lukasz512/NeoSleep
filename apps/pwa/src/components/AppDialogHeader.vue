<template>
  <header class="app-dialog-header" data-testid="app-dialog-header">
    <div class="app-dialog-header__lead">
      <AppAvatar
        v-if="avatarEntityType"
        :name="avatarName"
        :entity-type="avatarEntityType"
        :size="40"
        class="app-dialog-header__avatar"
      />
      <h2 class="app-dialog-header__title text-h6" data-testid="app-dialog-header-title">{{ title }}</h2>
    </div>
    <AppButton
      v-if="closable"
      icon
      variant="text"
      class="app-dialog-header__close"
      data-testid="app-dialog-header-close"
      :title="t('app.common.close')"
      :aria-label="t('app.common.close')"
      @click="emit('close')"
    >
      <AppIcon name="close" class="app-dialog-header__close-icon" />
    </AppButton>
  </header>
</template>

<script setup lang="ts">
/**
 * The one header for every titled dialog in the PWA (entity edit/create
 * forms via FormRenderer, EventForm, the OrthoApnea wizard/transaction log,
 * confirm dialogs): optional avatar + title on the left, close (X) pinned to
 * the right.
 *
 * Deliberately a plain <header>, not a VCardTitle. Vuetify injects each
 * component's own CSS lazily, after the app's global theme.scss, so
 * `.v-card-title { display: block }` used to win over the global
 * `.pwa-form-dialog__title-row { display: flex }` (same specificity, later
 * in the cascade) — the flex gap disappeared and the VSpacer's block div
 * pushed the X onto its own line under the avatar. Owning the element and
 * its scoped styles here takes Vuetify's card-title CSS out of the picture
 * entirely. Guarded by AppDialogHeader.spec.ts (no VCardTitle inside any
 * dialog) and e2e/dialog-header.spec.ts (real-browser layout, all engines).
 */
import { useI18n } from "vue-i18n";
import AppAvatar, { type AppAvatarEntityType } from "./AppAvatar.vue";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";

withDefaults(
  defineProps<{
    title: string;
    /** Shows an AppAvatar before the title; pair with avatarName for the initials. */
    avatarEntityType?: AppAvatarEntityType;
    avatarName?: string;
    /** false only for confirm dialogs, whose Cancel action already is the way out. */
    closable?: boolean;
  }>(),
  { avatarEntityType: undefined, avatarName: "", closable: true },
);

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
</script>

<style scoped>
.app-dialog-header {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 48px;
  padding: 24px 16px 8px 24px;
}

.app-dialog-header__lead {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.app-dialog-header__avatar {
  flex: none;
}

.app-dialog-header__title {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: rgb(var(--v-theme-on-surface));
}

.app-dialog-header__close {
  flex: none;
  margin-left: auto;
}

/* Without an explicit size the raw <svg> falls back to the browser's
   intrinsic 300x150 default and gets clipped to nothing by the button's
   overflow — same as .pwa-form-field-icon in theme.scss. */
.app-dialog-header__close-icon {
  width: 20px;
  height: 20px;
  color: rgb(var(--v-theme-on-surface));
}
</style>
