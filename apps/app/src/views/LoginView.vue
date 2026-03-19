<template>
  <div class="view-login">
    <VCard class="view-login__card" max-width="400">
      <VCardTitle class="view-login__title">{{ t("rep.login.title") }}</VCardTitle>
      <VCardSubtitle class="view-login__subtitle">{{ t("rep.login.subtitle") }}</VCardSubtitle>
      <VCardText class="view-login__body">
        <VAlert
          v-if="loginErrorKey"
          type="warning"
          variant="tonal"
          class="view-login__alert"
          closable
        >
          {{ t(loginErrorKey) }}
        </VAlert>
        <VBtn
          block
          color="primary"
          size="large"
          class="view-login__google-btn"
          :href="googleLoginUrl"
          target="_self"
        >
          <span class="view-login__google-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          </span>
          {{ t("rep.login.signInWithGoogle") }}
        </VBtn>

        <VDivider class="view-login__divider">{{ t("rep.login.or") }}</VDivider>

        <VTextField
          v-model="email"
          type="email"
          :label="t('rep.login.email')"
          variant="outlined"
          density="comfortable"
          hide-details
          class="view-login__field"
          autocomplete="email"
          disabled
        />
        <VTextField
          v-model="password"
          type="password"
          :label="t('rep.login.password')"
          variant="outlined"
          density="comfortable"
          hide-details
          class="view-login__field"
          autocomplete="current-password"
          disabled
        />
        <p class="view-login__mockup-note">{{ t("rep.login.emailPasswordMockup") }}</p>

        <template v-if="isDev">
          <VDivider class="view-login__divider" />
          <p class="view-login__dev-label">{{ t("rep.login.loginAsDev") }}</p>
          <VSelect
            v-model="devUser"
            :items="devUserItems"
            item-title="title"
            item-value="id"
            density="comfortable"
            variant="outlined"
            hide-details
            class="view-login__dev-select"
          />
          <VBtn
            block
            color="primary"
            variant="outlined"
            class="mt-3"
            @click="goToApp"
          >
            {{ t("rep.login.goToApp") }}
          </VBtn>
        </template>
      </VCardText>
    </VCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../stores/auth";
import { getApiUrl } from "../constants";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const isDev = import.meta.env.DEV;

const email = ref("");
const password = ref("");

const googleLoginUrl = computed(() => `${getApiUrl()}/auth/google`);

const loginErrorKey = computed(() => {
  const err = route.query.error;
  if (err === "auth_failed") return "rep.login.error.authFailed";
  if (err === "server_config") return "rep.login.error.serverConfig";
  if (err === "session_failed") return "rep.login.error.sessionFailed";
  if (err === "token_exchange" || err === "no_token" || err === "userinfo") return "rep.login.error.serverConfig";
  return null;
});

/** Temporarily default to admin for dev login. */
const devUser = ref("admin");
const devUserItems = computed(() => [
  { id: "rep", title: t("rep.login.devUser.rep") },
  { id: "admin", title: t("rep.login.devUser.admin") },
  { id: "viewer", title: t("rep.login.devUser.viewer") },
]);

function getRedirectPath(): string {
  const r = route.query.redirect;
  return typeof r === "string" && r.startsWith("/") ? r : "/dashboard";
}

function goToApp() {
  const role = devUser.value === "admin" ? "admin" : devUser.value === "viewer" ? "rep" : "rep";
  authStore.setAuthenticated(true, {
    id: "dev-user",
    email: "dev@neosleep.local",
    name: role === "admin" ? "Anna (Admin)" : "Jan (Rep)",
    role: role === "admin" ? "admin" : "rep",
  });
  router.push(getRedirectPath());
}

/** After Google OAuth redirect: check API session and sync auth state. */
onMounted(async () => {
  if (route.query.from === "google") {
    try {
      const ok = await authStore.fetchSession();
      if (ok) {
        router.replace({ path: getRedirectPath(), query: {} });
      } else {
        router.replace({ path: "/login", query: { error: "session_failed" } });
      }
    } catch {
      router.replace({ path: "/login", query: { error: "session_failed" } });
    }
  }
});
</script>

<style lang="scss" scoped>
.view-login {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 24px;
}

.view-login__card {
  width: 100%;
}

.view-login__title {
  font-size: 1.5rem;
  font-weight: 600;
  padding-bottom: 0;
}

.view-login__subtitle {
  padding-top: 4px;
  opacity: 0.85;
}

.view-login__body {
  padding-top: 8px;
}

.view-login__alert {
  margin-bottom: 16px;
}

.view-login__google-btn {
  text-transform: none;
  letter-spacing: normal;
  min-height: 44px;
}

.view-login__google-icon {
  display: inline-flex;
  margin-inline-end: 10px;
}

.view-login__divider {
  margin: 20px 0 16px 0;
}

.view-login__field {
  margin-bottom: 12px;
}

.view-login__field:last-of-type {
  margin-bottom: 8px;
}

.view-login__mockup-note {
  margin: 0 0 8px 0;
  font-size: 0.75rem;
  color: var(--rep-text-secondary, #666);
}

.view-login__dev-label {
  margin: 0 0 8px 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--rep-text-secondary, #666);
}

.view-login__dev-select {
  margin-bottom: 4px;
}
</style>
