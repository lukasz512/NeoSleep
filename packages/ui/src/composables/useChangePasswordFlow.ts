import { ref } from "vue";
import { useRouter } from "vue-router";
import type { ApiFetchOptions } from "@api";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

export function createUseChangePasswordFlow(apiFetch: ApiFetchFn) {
  return function useChangePasswordFlow() {
    const router = useRouter();

    const currentPassword = ref("");
    const newPassword = ref("");
    const loading = ref(false);
    const errorKey = ref<string | null>(null);

    async function submit(): Promise<void> {
      errorKey.value = null;
      loading.value = true;
      try {
        const res = await apiFetch("/api/v1/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_password: currentPassword.value,
            new_password: newPassword.value,
          }),
          handleErrors: false,
        });

        if (res.status === 401) {
          errorKey.value = "user.changePassword.error.incorrectCurrent";
          return;
        }
        if (!res.ok) {
          errorKey.value = "user.changePassword.error.network";
          return;
        }

        await router.push("/dashboard");
      } catch {
        errorKey.value = "user.changePassword.error.network";
      } finally {
        loading.value = false;
      }
    }

    return { currentPassword, newPassword, loading, errorKey, submit };
  };
}
