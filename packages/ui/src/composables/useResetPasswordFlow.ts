import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import type { ApiFetchOptions } from "@api";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

export function createUseResetPasswordFlow(apiFetch: ApiFetchFn) {
  return function useResetPasswordFlow() {
    const router = useRouter();
    const route = useRoute();

    const token = typeof route.query.token === "string" ? route.query.token : "";

    const newPassword = ref("");
    const confirmPassword = ref("");
    const loading = ref(false);
    const errorKey = ref<string | null>(null);
    const tokenValid = ref<boolean | null>(null);

    async function validateToken(): Promise<void> {
      if (!token) {
        tokenValid.value = false;
        return;
      }
      loading.value = true;
      try {
        const res = await apiFetch(
          `/api/v1/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
          { handleErrors: false },
        );
        const data = (await res.json()) as { valid: boolean };
        tokenValid.value = !!data.valid;
      } catch {
        tokenValid.value = false;
      } finally {
        loading.value = false;
      }
    }

    async function submit(): Promise<void> {
      errorKey.value = null;
      loading.value = true;
      try {
        const res = await apiFetch("/api/v1/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, new_password: newPassword.value }),
          handleErrors: false,
        });

        if (!res.ok) {
          errorKey.value = "user.resetPassword.error.invalidToken";
          return;
        }

        await router.push("/login");
      } catch {
        errorKey.value = "user.resetPassword.error.network";
      } finally {
        loading.value = false;
      }
    }

    return { newPassword, confirmPassword, loading, errorKey, tokenValid, validateToken, submit };
  };
}
