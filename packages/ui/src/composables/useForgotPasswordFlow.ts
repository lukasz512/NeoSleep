import { ref } from "vue";
import { useRoute } from "vue-router";
import type { ApiFetchOptions } from "@api";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

export function createUseForgotPasswordFlow(apiFetch: ApiFetchFn) {
  return function useForgotPasswordFlow() {
    const route = useRoute();

    // Carried over from the login form (see LoginView's forgotPasswordRoute)
    // so the user isn't asked to retype an email they already entered.
    const prefillEmail = typeof route.query.email === "string" ? route.query.email : "";
    const email = ref(prefillEmail);
    const loading = ref(false);
    const errorKey = ref<string | null>(null);
    const submitted = ref(false);

    async function submit(): Promise<void> {
      errorKey.value = null;
      loading.value = true;
      try {
        const res = await apiFetch("/api/v1/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.value.trim().toLowerCase() }),
          handleErrors: false,
        });

        if (!res.ok) {
          errorKey.value = "user.forgotPassword.error.network";
          return;
        }

        // Backend always responds 200 with a generic message regardless of
        // whether the account exists, so the UI can't distinguish either —
        // that's intentional, it prevents email enumeration.
        submitted.value = true;
      } catch {
        errorKey.value = "user.forgotPassword.error.network";
      } finally {
        loading.value = false;
      }
    }

    return { email, loading, errorKey, submitted, submit };
  };
}
