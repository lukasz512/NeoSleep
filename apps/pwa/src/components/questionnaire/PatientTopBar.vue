<template>
  <!-- The patient page's own app bar (NEO-126): the clinic's logo on the left,
       the patient's avatar on the right — a first step towards a patient
       space. The avatar opens the same account menu the app uses, in patient
       mode: theme, language and where to turn, no account actions. -->
  <header class="patient-bar">
    <span class="patient-bar__chip patient-bar__logo">
      <BrandLogo
        :dark="themeStore.mode === 'dark'"
        :light-src="configStore.config.logo_url"
        :dark-src="configStore.config.logo_dark_url"
        class="patient-bar__logo-img"
      />
    </span>

    <AppAccountMenu v-if="firstName" v-model:open="menuOpen" :mobile="isPhone" :label="t('app.questionnaire.menu.label')">
      <template #trigger="{ open }">
        <button
          type="button"
          class="patient-bar__avatar-btn"
          :title="t('app.questionnaire.menu.label')"
          :aria-label="t('app.questionnaire.menu.label')"
          aria-haspopup="dialog"
          :aria-expanded="open"
          data-testid="patient-bar-avatar"
        >
          <VAvatar size="40" color="primary" class="patient-bar__avatar" data-motion="trigger-avatar">
            <span class="text-body-medium font-weight-bold">{{ initial }}</span>
          </VAvatar>
          <!-- The link was verified by the server: this page really is for this patient. -->
          <span class="patient-bar__verified" aria-hidden="true"><AppIcon name="check" /></span>
        </button>
      </template>

      <AppUserMenuPanel
        :sheet="isPhone"
        :name="firstName"
        :role-label="t('app.questionnaire.menu.role', { clinic })"
        :initials="initial"
        :theme-preference="themeStore.preference"
        :locale="(locale as string)"
        :can-change-password="false"
        :account-actions="false"
        version=""
        :channel="null"
        @set-theme="themeStore.setPreference"
        @change-locale="setLocale"
        @close="menuOpen = false"
      >
        <template #links>
          <button type="button" class="user-menu__row" data-motion="row" @click="openInfo('security')">
            <AppIcon name="shield-check" class="user-menu__row-icon" />{{ t("app.questionnaire.menu.security") }}
          </button>
          <a class="user-menu__row" data-motion="row" :href="privacyUrl" target="_blank" rel="noopener noreferrer">
            <AppIcon name="file" class="user-menu__row-icon" />{{ t("app.questionnaire.menu.privacy") }}
            <AppIcon name="external-link" class="user-menu__row-icon user-menu__row-note" />
          </a>
          <a v-if="clinicEmail" class="user-menu__row" data-motion="row" :href="`mailto:${clinicEmail}`">
            <AppIcon name="mail" class="user-menu__row-icon" />{{ t("app.questionnaire.menu.email") }}
            <span class="user-menu__row-note">{{ clinicEmail }}</span>
          </a>
          <a v-if="clinicPhone" class="user-menu__row" data-motion="row" :href="`tel:${clinicPhone.replace(/[^\d+]/g, '')}`">
            <AppIcon name="phone" class="user-menu__row-icon" />{{ t("app.questionnaire.menu.phone") }}
            <span class="user-menu__row-note">{{ clinicPhone }}</span>
          </a>
          <button type="button" class="user-menu__row" data-motion="row" @click="openInfo('help')">
            <AppIcon name="help-circle" class="user-menu__row-icon" />{{ t("app.questionnaire.menu.help") }}
          </button>
          <a v-if="websiteUrl" class="user-menu__row" data-motion="row" :href="websiteUrl" target="_blank" rel="noopener noreferrer">
            <AppIcon name="globe" class="user-menu__row-icon" />{{ websiteHost }}
            <AppIcon name="external-link" class="user-menu__row-icon user-menu__row-note" />
          </a>
        </template>
      </AppUserMenuPanel>
    </AppAccountMenu>

    <AppFormDialog
      :model-value="info !== null"
      :title="info === 'help' ? t('app.questionnaire.menu.help') : t('app.questionnaire.menu.security')"
      :max-width="460"
      @update:model-value="(open: boolean) => { if (!open) info = null; }"
      @close="info = null"
    >
      <ol v-if="info === 'help'" class="patient-bar__info patient-bar__info--steps">
        <li>{{ t("app.questionnaire.info.help.read") }}</li>
        <li>{{ t("app.questionnaire.info.help.sign") }}</li>
        <li>{{ t("app.questionnaire.info.help.done") }}</li>
      </ol>
      <ul v-else class="patient-bar__info">
        <li><AppIcon name="lock" class="patient-bar__info-icon" />{{ t("app.questionnaire.info.security.link") }}</li>
        <li><AppIcon name="shield-check" class="patient-bar__info-icon" />{{ t("app.questionnaire.info.security.encrypted") }}</li>
        <li><AppIcon name="file" class="patient-bar__info-icon" />{{ t("app.questionnaire.info.security.signed") }}</li>
      </ul>
      <p v-if="info === 'help'" class="patient-bar__info-foot">{{ t("app.questionnaire.info.help.doubts") }}</p>
      <p v-else class="patient-bar__info-foot">
        <a :href="privacyUrl" target="_blank" rel="noopener noreferrer">{{ t("app.questionnaire.consentNotice.fullNotice") }}</a>
      </p>
      <template #actions>
        <AppButton color="primary" block @click="info = null">{{ t("app.questionnaire.info.close") }}</AppButton>
      </template>
    </AppFormDialog>
  </header>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useDisplay, useTheme } from "vuetify";
import { BrandLogo } from "@ui";
import { useThemeStore } from "@stores";
import AppAccountMenu from "../../layouts/components/AppAccountMenu.vue";
import AppUserMenuPanel from "../../layouts/components/AppUserMenuPanel.vue";
import AppFormDialog from "../AppFormDialog.vue";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import { useConfigStore } from "../../stores/config";
import { loadLocale } from "../../plugins/i18n";

const props = defineProps<{
  /** Null while the link is loading or dead — no avatar then, the page isn't anyone's yet. */
  firstName: string | null;
  clinic: string;
  clinicEmail: string | null;
  clinicPhone: string | null;
  privacyUrl: string;
  websiteUrl: string;
}>();

const { t, locale } = useI18n();
const themeStore = useThemeStore();
const configStore = useConfigStore();
// The tenant's own logo (white-label, app_config) — public endpoint, no login needed.
configStore.load().catch(() => {
  // benign: the built-in NeoSleep logo stays.
});

// This page lives outside AppLayout, which normally keeps Vuetify's theme in
// step with the shared store — do it here (same as AuthChrome).
const vuetifyTheme = useTheme();
watch(() => themeStore.mode, (mode) => vuetifyTheme.change(mode), { immediate: true, flush: "sync" });

const { xs: isPhone } = useDisplay();
const menuOpen = ref(false);
const info = ref<"security" | "help" | null>(null);

const initial = computed(() => (props.firstName ?? "").trim().charAt(0).toUpperCase());
const websiteHost = computed(() => {
  try {
    return new URL(props.websiteUrl).host.replace(/^www\./, "");
  } catch {
    return props.websiteUrl;
  }
});

async function setLocale(lang: string) {
  if (lang !== "en" && lang !== "pl" && lang !== "mx") return;
  await loadLocale(lang);
  locale.value = lang;
}

function openInfo(kind: "security" | "help") {
  menuOpen.value = false;
  info.value = kind;
}
</script>

<style scoped>
.patient-bar {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 960px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 auto;
}

/* A translucent surface chip: the bar floats over the photo + gradient
   backdrop, and the logo must read on both its light and teal parts. */
.patient-bar__chip {
  display: inline-flex;
  align-items: center;
  border-radius: 12px;
  background: rgba(var(--v-theme-surface), 0.78);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(8px);
}

.patient-bar__logo {
  padding: 9px 14px;
  animation: patient-bar-in 450ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.patient-bar__logo-img {
  display: block;
  height: 22px;
  width: auto;
}

.patient-bar__avatar-btn {
  position: relative;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: none;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  animation: patient-bar-in 450ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both;
}

/* Square with soft corners — the app's identity avatar shape (NEO-57), not the round account button. */
.patient-bar__avatar {
  border-radius: 12px;
}

.patient-bar__avatar-btn:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.patient-bar__verified {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgb(var(--v-theme-success));
  color: #fff;
  border: 2px solid rgb(var(--v-theme-surface));
}

.patient-bar__verified :deep(svg) {
  width: 9px;
  height: 9px;
  stroke-width: 3.5;
}

.patient-bar__info {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  line-height: 1.5;
}

.patient-bar__info li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.patient-bar__info-icon {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 2px;
  color: rgb(var(--v-theme-primary));
}

.patient-bar__info--steps {
  counter-reset: step;
}

.patient-bar__info--steps li {
  counter-increment: step;
}

.patient-bar__info--steps li::before {
  content: counter(step);
  flex: none;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-size: 0.8125rem;
  font-weight: 700;
}

.patient-bar__info-foot {
  margin: 16px 0 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-bar__info-foot a {
  color: rgb(var(--v-theme-primary));
}

@keyframes patient-bar-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .patient-bar__logo,
  .patient-bar__avatar-btn {
    animation: none;
  }
}
</style>
