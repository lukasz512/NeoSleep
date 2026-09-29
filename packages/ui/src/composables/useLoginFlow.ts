import { ref, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { createAuthStore, type AuthTokenStorage } from "@stores";
import { reportCaught, reportFailedResponse, type ApiFetchOptions } from "@api";
import { applyCaughtError, applyFailedResponse, clearFlowErrors, createFlowErrors } from "./flowErrors";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

function getRedirectPath(redirect: unknown): string {
  return typeof redirect === "string" && redirect.startsWith("/")
    ? redirect
    : "/dashboard";
}

export function createUseLoginFlow(apiFetch: ApiFetchFn, tokenStorage: AuthTokenStorage) {
  const useAuthStore = createAuthStore(apiFetch, tokenStorage);

  return function useLoginFlow() {
    const router = useRouter();
    const route = useRoute();

    const email = ref("");
    const password = ref("");
    const rememberMe = ref(true);
    const loading = ref(false);
    // NEO-109: errorKey = a line in the form's summary box, toastKey = a toast
    // (connection / server only), fieldErrors = fields the API rejected.
    const errors = createFlowErrors();

    const redirectPath = computed(() => getRedirectPath(route.query.redirect));

    async function submit(options?: { onSuccess?: () => Promise<void> | void }): Promise<void> {
      clearFlowErrors(errors);
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
          errors.errorKey.value = "user.login.error.invalidCredentials";
          return;
        }
        if (res.status === 429) {
          errors.errorKey.value = "user.login.error.tooManyAttempts";
          return;
        }
        if (!res.ok) {
          // Status/code only — the payload (email, password) never leaves this function.
          const failure = await reportFailedResponse(res, { where: "useLoginFlow.submit" });
          await applyFailedResponse(errors, res, failure, "user.login.error.network");
          return;
        }

        const data = (await res.json()) as {
          token: string;
          refresh_token: string;
          user: { id: string; email: string; name?: string; picture?: string; role: "admin" | "manager" | "kam" | "msl" | "rep" | "doctor"; forcePasswordChange?: boolean };
          forcePasswordChange: boolean;
        };

        const authStore = useAuthStore();
        authStore.setAuthenticated(true, data.user, data.token, data.refresh_token);

        // Let the caller play an exit transition (e.g. AnimatedCard.playExit())
        // before the route actually changes, instead of the view vanishing instantly.
        await options?.onSuccess?.();

        if (data.forcePasswordChange) {
          await router.push("/change-password");
        } else {
          await router.push(redirectPath.value);
        }
      } catch (err) {
        reportCaught(err, { where: "useLoginFlow.submit" });
        applyCaughtError(errors, err, "user.login.error.network");
      } finally {
        loading.value = false;
      }
    }

    return {
      email,
      password,
      rememberMe,
      loading,
      errorKey: errors.errorKey,
      toastKey: errors.toastKey,
      fieldErrors: errors.fieldErrors,
      redirectPath,
      submit,
    };
  };
}
