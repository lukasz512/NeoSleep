<template>
  <div class="auth-callback">
    <VProgressCircular v-if="!errored" indeterminate color="primary" size="32" />
    <p>{{ t(errored ? "user.login.callback.error" : "user.login.callback.loading") }}</p>
    <!-- NEO-81: only when it wasn't the code itself (connection / our side) — an
         expired code is already covered by the message above. -->
    <p v-if="failureDetail" class="auth-callback__detail">{{ failureDetail }}</p>
    <!-- Never a dead end: a failed exchange (expired code, account deactivated
         meanwhile) gets a way back to the login screen. -->
    <VBtn v-if="errored" to="/login" color="primary" variant="outlined">
      {{ t("user.login.callback.backToLogin") }}
    </VBtn>
  </div>
</template>

<script setup lang="ts">
import { reportCaught, reportFailedResponse } from "@api";
import { useErrorTextFor } from "@ui";
import { computed, ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { apiFetch } from "../composables/useApi";
import { useAuthStore, type AuthUser } from "../stores/auth";

/** Landing point for the Google OAuth redirect (see apps/api/src/auth.ts's
 *  /auth/google/callback): exchanges the short-lived, single-claim code Google's
 *  redirect carries for a real auth token via POST /auth/google/exchange, same
 *  shape as /auth/login's response. */
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const errored = ref(false);
/** Why the exchange failed (NEO-81) — an expired code (4xx) reads differently from a server/network problem. */
const failure = ref<unknown>(null);
const failureText = useErrorTextFor(failure);
const NOT_THE_USERS_FAULT = new Set(["network", "timeout", "server", "rateLimited", "unexpected"]);
const failureDetail = computed(() =>
  failureText.value && NOT_THE_USERS_FAULT.has(failureText.value.cls)
    ? [failureText.value.body, failureText.value.reference].filter(Boolean).join(" ")
    : "",
);

onMounted(async () => {
  const code = typeof route.query.code === "string" ? route.query.code : "";
  if (!code) {
    errored.value = true;
    return;
  }
  try {
    const res = await apiFetch("/api/v1/auth/google/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      handleErrors: false,
    });
    if (!res.ok) {
      failure.value = await reportFailedResponse(res, { where: "AuthCallbackView.exchangeCode" });
      errored.value = true;
      return;
    }
    const data = (await res.json()) as {
      token: string;
      refresh_token: string;
      user: AuthUser;
      forcePasswordChange: boolean;
    };
    authStore.setAuthenticated(true, data.user, data.token, data.refresh_token);
    await router.push(data.forcePasswordChange ? "/change-password" : "/dashboard");
  } catch (err) {
    reportCaught(err, { where: "AuthCallbackView.exchangeCode" });
    failure.value = err;
    errored.value = true;
  }
});
</script>

<style scoped>
.auth-callback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  min-height: 60vh;
  text-align: center;
}

.auth-callback__detail {
  max-width: 32rem;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
