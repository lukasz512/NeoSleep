<template>
  <div class="login-view">
    <div class="login-view__topbar">
      <VMenu
        v-model="settingsMenuOpen"
        location="bottom end"
        :close-on-content-click="false"
        min-width="220"
      >
        <template #activator="{ props: menuProps }">
          <VBtn
            v-bind="menuProps"
            icon
            variant="text"
            size="small"
            :aria-label="t('user.settings.menu')"
            :title="t('user.settings.menu')"
          >
            <VIcon icon="mdi-cog-outline" />
          </VBtn>
        </template>
        <VCard class="login-view__settings-card">
          <ThemeLocaleSwitcher
            :theme="theme"
            :locale="locale"
            @toggle-theme="toggleTheme"
            @change-locale="onChangeLocale"
          />
        </VCard>
      </VMenu>
    </div>

    <VCard class="login-view__card" elevation="4" rounded="lg">

      <div class="login-view__logo-wrap">
        <VImg
          v-if="logoUrl"
          :src="logoUrl"
          :alt="t('user.login.logoAlt')"
          max-height="56"
          contain
          class="login-view__logo"
        />
        <p v-else class="login-view__app-name">NeoSleep</p>
      </div>

      <VCardText class="login-view__body">
        <h1 class="login-view__title">{{ t('user.login.title') }}</h1>
        <p class="login-view__subtitle">{{ t('user.login.subtitle') }}</p>

        <VAlert
          v-if="errorKey"
          type="error"
          variant="tonal"
          density="compact"
          class="login-view__alert"
          closable
          @click:close="errorKey = null"
        >
          {{ t(errorKey) }}
        </VAlert>

        <VForm ref="form" class="login-view__form" @submit.prevent="handleSubmit">
          <VTextField
            v-model="email"
            type="email"
            :label="t('user.login.email')"
            variant="outlined"
            density="comfortable"
            autocomplete="email"
            :rules="[ruleEmailRequired, ruleEmailFormat]"
            class="login-view__field"
            :disabled="loading"
          />

          <VTextField
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            :label="t('user.login.password')"
            variant="outlined"
            density="comfortable"
            autocomplete="current-password"
            :rules="[rulePasswordRequired]"
            class="login-view__field"
            :disabled="loading"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword"
          />

          <div class="login-view__row">
            <VCheckbox
              v-model="rememberMe"
              :label="t('user.login.rememberMe')"
              density="compact"
              hide-details
              class="login-view__remember"
            />
          </div>

          <VBtn
            type="submit"
            color="primary"
            size="large"
            block
            :loading="loading"
            class="login-view__submit"
          >
            {{ t('user.login.signIn') }}
          </VBtn>
        </VForm>

        <div class="login-view__footer">
          <VBtn
            variant="text"
            size="small"
            disabled
            class="login-view__forgot"
          >
            {{ t('user.login.forgotPassword') }}
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from "vue";
import { useI18n } from "vue-i18n";
import { useTheme } from "vuetify";
import { en as vuetifyEn, pl as vuetifyPl, es as vuetifyEs } from "vuetify/locale";
import { createConfigStore } from "@stores";
import { createUseLoginFlow } from "../composables/useLoginFlow";
import { loadLocaleMessages, type SupportedLocale } from "@i18n/loadLocale";
import type { ApiFetchOptions } from "@api";
import ThemeLocaleSwitcher from "../components/ThemeLocaleSwitcher.vue";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

const i18n = useI18n();
const { t, locale } = i18n;

const settingsMenuOpen = ref(false);
const vuetifyTheme = useTheme();
const theme = computed<"light" | "dark">(() => (vuetifyTheme.current.value.dark ? "dark" : "light"));

function toggleTheme() {
  vuetifyTheme.change(theme.value === "dark" ? "light" : "dark");
}

const vuetifyLocales: Record<SupportedLocale, Record<string, unknown>> = {
  en: vuetifyEn,
  pl: vuetifyPl,
  mx: vuetifyEs,
};

async function onChangeLocale(lang: string) {
  const next = lang as SupportedLocale;
  await loadLocaleMessages(i18n, next, { $vuetify: vuetifyLocales[next] });
  locale.value = next;
}

const apiFetch = inject<ApiFetchFn>("neo:apiFetch")!;

const useConfigStore = createConfigStore(apiFetch);
const configStore = useConfigStore();
const logoUrl = computed(() => configStore.config.logo_url ?? null);

const useLoginFlow = createUseLoginFlow(apiFetch);
const { email, password, rememberMe, loading, errorKey, submit } = useLoginFlow();

const showPassword = ref(false);
const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);

const ruleEmailRequired = (v: string) =>
  !!v.trim() || t("user.login.validation.emailRequired");
const ruleEmailFormat = (v: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || t("user.login.validation.emailInvalid");
const rulePasswordRequired = (v: string) =>
  !!v || t("user.login.validation.passwordRequired");

async function handleSubmit() {
  if (!form.value) return;
  const { valid } = await form.value.validate();
  if (valid) await submit();
}
</script>

<style scoped>
.login-view {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 24px 16px;
  gap: 16px;
}

.login-view__topbar {
  position: absolute;
  top: 12px;
  right: 12px;
}

.login-view__settings-card {
  min-width: 220px;
  padding: 12px;
}

.login-view__card {
  width: 100%;
  max-width: 420px;
}

.login-view__logo-wrap {
  display: flex;
  justify-content: center;
  padding: 32px 32px 0;
}

.login-view__logo {
  max-width: 200px;
}

.login-view__app-name {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.5px;
  margin: 0;
  color: rgb(var(--v-theme-primary));
}

.login-view__body {
  padding: 24px 32px 32px;
}

.login-view__title {
  font-size: 1.375rem;
  font-weight: 600;
  letter-spacing: -0.25px;
  margin: 0 0 4px;
  line-height: 1.3;
}

.login-view__subtitle {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin: 0 0 24px;
}

.login-view__alert {
  margin-bottom: 20px;
}

.login-view__form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.login-view__field {
  margin-bottom: 4px;
}

.login-view__row {
  display: flex;
  align-items: center;
  margin: 0 0 16px;
}

.login-view__remember {
  flex: 1;
}

.login-view__submit {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 600;
}

.login-view__footer {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

.login-view__forgot {
  text-transform: none;
  letter-spacing: normal;
  opacity: 0.5;
}
</style>
