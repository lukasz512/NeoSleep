<template>
  <div class="auth-callback">
    <VProgressCircular v-if="!errored" indeterminate color="primary" size="32" />
    <p>{{ t(errored ? "user.login.callback.error" : "user.login.callback.loading") }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
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
      errored.value = true;
      return;
    }
    const data = (await res.json()) as {
      token: string;
      user: AuthUser;
      forcePasswordChange: boolean;
    };
    authStore.setAuthenticated(true, data.user, data.token);
    await router.push(data.forcePasswordChange ? "/change-password" : "/dashboard");
  } catch {
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
</style>
