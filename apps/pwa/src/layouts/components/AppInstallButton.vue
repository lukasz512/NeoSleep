<template>
  <template v-if="mode">
    <AppButton
      v-if="compact"
      icon
      variant="text"
      class="install-btn install-btn--icon"
      data-testid="app-install-button"
      ignore-global-loading
      :title="t('layout.install.button')"
      :aria-label="t('layout.install.button')"
      @click="onClick"
    >
      <AppIcon name="install" class="install-btn__icon" />
    </AppButton>
    <AppButton
      v-else
      variant="tonal"
      color="primary"
      size="small"
      class="install-btn"
      data-testid="app-install-button"
      ignore-global-loading
      @click="onClick"
    >
      <AppIcon name="install" class="install-btn__icon install-btn__icon--lead" />
      {{ t("layout.install.button") }}
    </AppButton>

    <!-- iOS/iPadOS: no install API, only the Share sheet. -->
    <VDialog v-model="iosHintOpen" max-width="380" :transition="originDialogTransition">
      <VCard class="pwa-confirm-dialog__card" data-testid="app-install-ios-hint">
        <AppDialogHeader :title="t('layout.install.iosTitle')" @close="iosHintOpen = false" />
        <VCardText>
          <p class="install-hint__intro">{{ t("layout.install.iosIntro") }}</p>
          <ol class="install-hint__steps">
            <li>
              <AppIcon name="share-ios" class="install-hint__glyph" />
              <span>{{ t("layout.install.iosStepShare") }}</span>
            </li>
            <li>
              <AppIcon name="add-square" class="install-hint__glyph" />
              <span>{{ t("layout.install.iosStepAdd") }}</span>
            </li>
          </ol>
        </VCardText>
        <VCardActions>
          <VSpacer />
          <AppButton @click="iosHintOpen = false">{{ t("app.common.ok") }}</AppButton>
        </VCardActions>
      </VCard>
    </VDialog>
  </template>
</template>

<script setup lang="ts">
/**
 * "Install app" entry point in the app bar, next to the account avatar
 * (NEO-87). Hidden when the app already runs installed, or when the browser
 * can't install it (e.g. Firefox desktop). See useInstallPrompt.ts.
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { originDialogTransition } from "@ui";
import AppButton from "../../components/AppButton.vue";
import AppIcon from "../../components/AppIcon.vue";
import AppDialogHeader from "../../components/AppDialogHeader.vue";
import { useInstallPrompt } from "../../composables/useInstallPrompt";

defineProps<{
  /** Icon-only (phone app bar); desktop shows icon + label. */
  compact?: boolean;
}>();

const { t } = useI18n();
const { mode, promptInstall } = useInstallPrompt();
const iosHintOpen = ref(false);

function onClick(): void {
  if (mode.value === "ios") iosHintOpen.value = true;
  else void promptInstall();
}
</script>

<style scoped>
.install-btn__icon {
  width: 22px;
  height: 22px;
}

.install-btn__icon--lead {
  width: 18px;
  height: 18px;
  margin-inline-end: 6px;
}

/* theme.scss pads every non-icon button 24px (pill CTA); this sits in the
   crowded app bar, so it gets the compact padding instead. */
.install-btn.v-btn:not(.v-btn--icon) {
  padding-inline: 12px 14px !important;
  margin-inline-end: 8px;
  text-transform: none;
  letter-spacing: normal;
}

.install-hint__intro {
  margin: 0 0 12px;
}

.install-hint__steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  counter-reset: step;
}

.install-hint__steps li {
  display: flex;
  align-items: center;
  gap: 10px;
}

.install-hint__steps li::before {
  counter-increment: step;
  content: counter(step) ".";
  min-width: 1.2em;
  font-weight: 600;
}

.install-hint__glyph {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  color: rgb(var(--v-theme-primary));
}
</style>
