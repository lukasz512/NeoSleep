import { ref, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { createAuthStore } from "@stores";
import type { ApiFetchOptions } from "@api";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

function getRedirectPath(redirect: unknown): string {
  return typeof redirect === "string" && redirect.startsWith("/")
    ? redirect
    : "/dashboard";
}

export function createUseLoginFlow(apiFetch: ApiFetchFn) {
  const useAuthStore = createAuthStore(apiFetch);

  return function useLoginFlow() {
    const router = useRouter();
    const route = useRoute();

    const email = ref("");
    const password = ref("");
    const rememberMe = ref(false);
    const loading = ref(false);
    const errorKey = ref<string | null>(null);

    const redirectPath = computed(() => getRedirectPath(route.query.redirect));

    async function submit(): Promise<void> {
      errorKey.value = null;
      loading.value = true;
      try {
        const res = await apiFetch("/api/v1/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.value.trim().toLowerCase(),
            password: password.value,
            remember_me: rememberMe.value,
          }),
          handleErrors: false,
        });

        if (res.status === 401) {
          errorKey.value = "user.login.error.invalidCredentials";
          return;
        }
        if (res.status === 429) {
          errorKey.value = "user.login.error.tooManyAttempts";
          return;
        }
        if (!res.ok) {
          errorKey.value = "user.login.error.network";
          return;
        }

        const data = (await res.json()) as {
          user: { id: string; email: string; name?: string; picture?: string; role: "admin" | "ffm" | "kam" | "msl" | "rep"; forcePasswordChange?: boolean };
          forcePasswordChange: boolean;
        };

        const authStore = useAuthStore();
        authStore.setAuthenticated(true, data.user);

        if (data.forcePasswordChange) {
          await router.push("/change-password");
        } else {
          await router.push(redirectPath.value);
        }
      } catch {
        errorKey.value = "user.login.error.network";
      } finally {
        loading.value = false;
      }
    }

    return { email, password, rememberMe, loading, errorKey, redirectPath, submit };
  };
}
