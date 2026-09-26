<template>
  <component
    :is="sheet ? VBottomSheet : VDialog"
    v-if="method"
    v-model="cardOpen"
    :max-width="sheet ? undefined : 440"
    :transition="sheet ? undefined : originDialogTransition"
    class="install-card-overlay"
    persistent
  >
    <VCard class="install-card" data-testid="app-install-card">
      <div class="install-card__head">
        <span class="install-card__app-icon" aria-hidden="true">
          <img src="/icon-192.png" alt="" width="40" height="40" />
        </span>
        <h2 class="install-card__title">{{ t(`layout.install.title.${device.form}`) }}</h2>
      </div>

      <!-- Native dialog available: say why, then one button. -->
      <template v-if="method === 'prompt'">
        <ul class="install-card__benefits">
          <li v-for="key in benefits" :key="key">
            <AppIcon name="check" class="install-card__check" />
            <span>{{ t(key) }}</span>
          </li>
        </ul>
      </template>

      <!-- Otherwise: the device's own manual steps. -->
      <ol v-else-if="steps.length" class="install-card__steps" data-testid="app-install-steps">
        <li v-for="(step, i) in steps" :key="step.key">
          <span class="install-card__step-no">{{ i + 1 }}</span>
          <AppIcon v-if="step.icon" :name="step.icon" class="install-card__step-icon" />
          <span>{{ t(step.key) }}</span>
        </li>
      </ol>

      <p v-else class="install-card__note" data-testid="app-install-other-browser">
        {{ t(`layout.install.otherBrowser.${device.os === "mac" ? "mac" : "windows"}`) }}
      </p>

      <!-- Computers: also carry NeoSleep over to the phone (QR only, no SMS). -->
      <div v-if="device.form === 'desktop' && qrDataUrl" class="install-card__qr" data-testid="app-install-qr">
        <img :src="qrDataUrl" :alt="t('layout.install.qr.alt')" width="104" height="104" />
        <div>
          <p class="install-card__qr-title">{{ t("layout.install.qr.title") }}</p>
          <p class="install-card__qr-body">{{ t("layout.install.qr.body") }}</p>
        </div>
      </div>

      <div class="install-card__actions">
        <template v-if="method === 'prompt'">
          <AppButton variant="text" data-testid="app-install-later" @click="postpone()">
            {{ t("layout.install.later") }}
          </AppButton>
          <AppButton color="primary" data-testid="app-install-add" @click="onAdd">
            {{ t(`layout.install.action.${device.form}`) }}
          </AppButton>
        </template>
        <template v-else>
          <AppButton variant="text" data-testid="app-install-later" @click="postpone()">
            {{ t("layout.install.later") }}
          </AppButton>
          <AppButton color="primary" data-testid="app-install-done" @click="cardOpen = false">
            {{ t("layout.install.gotIt") }}
          </AppButton>
        </template>
      </div>
    </VCard>
  </component>
</template>

<script setup lang="ts">
/**
 * "Add NeoSleep to this device" card (NEO-87, variant C). Opens by itself
 * once after login (schedule in useInstallPrompt.ts: "Later" → once more
 * after 7 days → never), and from the avatar menu at any time (variant E).
 * Wording follows the detected device: phone, tablet, Windows or Mac. On a
 * computer it also shows a QR code to open NeoSleep on a phone (variant F).
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import QRCode from "qrcode";
import { VBottomSheet } from "vuetify/components/VBottomSheet";
import { VDialog } from "vuetify/components/VDialog";
import { originDialogTransition } from "@ui";
import AppButton from "../../components/AppButton.vue";
import AppIcon, { type AppIconName } from "../../components/AppIcon.vue";
import { useInstallPrompt } from "../../composables/useInstallPrompt";

const { t } = useI18n();
const { device, method, cardOpen, promptInstall, maybeOpenCard, postpone } = useInstallPrompt();

/** Bottom sheet on phones and tablets, centred dialog on computers. */
const sheet = device.form !== "desktop";

const benefits = computed(() => {
  if (device.form !== "desktop") {
    return ["layout.install.benefit.oneTap", "layout.install.benefit.fullScreen", "layout.install.benefit.noAddress"];
  }
  return [
    "layout.install.benefit.ownWindow",
    device.os === "mac" ? "layout.install.benefit.dock" : "layout.install.benefit.taskbar",
    "layout.install.benefit.noAddress",
  ];
});

interface Step { key: string; icon?: AppIconName }

const steps = computed<Step[]>(() => {
  switch (method.value) {
    case "ios-share":
      return [
        { key: `layout.install.steps.iosShare.${device.form === "tablet" ? "tablet" : "phone"}`, icon: "share-ios" },
        { key: "layout.install.steps.iosAdd", icon: "add-square" },
      ];
    case "mac-dock":
      return [{ key: "layout.install.steps.macFile" }, { key: "layout.install.steps.macDock" }];
    case "android-menu":
      return [
        { key: "layout.install.steps.androidMenu", icon: "dots-vertical" },
        { key: "layout.install.steps.androidInstall" },
      ];
    default:
      return [];
  }
});

const qrDataUrl = ref<string | null>(null);
let openTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  // Let the first screen settle before asking anything.
  openTimer = setTimeout(() => maybeOpenCard(), 1500);
  if (device.form === "desktop") {
    // SVG, not PNG: crisp at any size and needs no <canvas> (same as QuestionnaireQrDialog).
    const svg = await QRCode.toString(`${window.location.origin}/`, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    qrDataUrl.value = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
});

onUnmounted(() => {
  if (openTimer) clearTimeout(openTimer);
});

function onAdd(): void {
  void promptInstall();
}
</script>

<style scoped>
.install-card {
  display: grid;
  gap: var(--space-4, 16px);
  padding: var(--space-6, 24px);
  /* Bottom sheet on phones: keep the buttons above the home indicator. */
  padding-bottom: calc(var(--space-6, 24px) + env(safe-area-inset-bottom, 0px));
}

.install-card__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.install-card__app-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: #fff;
  display: grid;
  place-items: center;
}

.install-card__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.3;
}

.install-card__benefits,
.install-card__steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}

.install-card__benefits li,
.install-card__steps li {
  display: flex;
  align-items: center;
  gap: 10px;
}

.install-card__check {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: rgb(var(--v-theme-primary));
}

.install-card__step-no {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 0.8rem;
  font-weight: 700;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.install-card__step-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  color: rgb(var(--v-theme-primary));
}

.install-card__note {
  margin: 0;
}

.install-card__qr {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.install-card__qr img {
  flex-shrink: 0;
  background: #fff;
  border-radius: 6px;
}

.install-card__qr-title {
  margin: 0 0 4px;
  font-weight: 600;
}

.install-card__qr-body {
  margin: 0;
  font-size: 0.875rem;
  opacity: var(--v-medium-emphasis-opacity);
}

.install-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
