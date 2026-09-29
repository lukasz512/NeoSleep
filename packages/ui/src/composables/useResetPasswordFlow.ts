import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { apiErrorFromResponse, reportCaught, type ApiFetchOptions } from "@api";
import { applyCaughtError, applyFailedResponse, clearFlowErrors, createFlowErrors } from "./flowErrors";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

export function createUseResetPasswordFlow(apiFetch: ApiFetchFn) {
  return function useResetPasswordFlow() {
    const router = useRouter();
    const route = useRoute();

    const token = typeof route.query.token === "string" ? route.query.token : "";

    const newPassword = ref("");
    const confirmPassword = ref("");
    const loading = ref(false);
    // NEO-109: errorKey = a line in the form's summary box, toastKey = a toast
    // (connection / server only), fieldErrors = fields the API rejected.
    const errors = createFlowErrors();
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
        if (!res.ok) {
          const failure = await apiErrorFromResponse(res);
          if (failure.kind === "client") {
            tokenValid.value = false;
            return;
          }
          // Our side failed (5xx / 429) — never tell the user their link is invalid for
          // that. Let them try: submit re-checks the token and says so if it's really bad.
          reportCaught(failure, { where: "useResetPasswordFlow.validateToken" });
          applyCaughtError(errors, failure, "user.resetPassword.error.network");
          tokenValid.value = true;
          return;
        }
        const data = (await res.json()) as { valid: boolean };
        tokenValid.value = !!data.valid;
      } catch (err) {
        reportCaught(err, { where: "useResetPasswordFlow.validateToken" });
        applyCaughtError(errors, err, "user.resetPassword.error.network");
        tokenValid.value = true;
      } finally {
        loading.value = false;
      }
    }

    async function submit(): Promise<void> {
      clearFlowErrors(errors);
      loading.value = true;
      try {
        const res = await apiFetch("/api/v1/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, new_password: newPassword.value }),
          handleErrors: false,
        });

        if (!res.ok) {
          const failure = await apiErrorFromResponse(res);
          if (failure.kind !== "client") reportCaught(failure, { where: "useResetPasswordFlow.submit" });
          // A 4xx naming a field is that field; any other 4xx is the token
          // (expired / used) — a form-level line; the rest is not the user's link.
          await applyFailedResponse(errors, res, failure, "user.resetPassword.error.invalidToken");
          return;
        }

        await router.push("/login");
      } catch (err) {
        reportCaught(err, { where: "useResetPasswordFlow.submit" });
        applyCaughtError(errors, err, "user.resetPassword.error.network");
      } finally {
        loading.value = false;
      }
    }

    return {
      newPassword,
      confirmPassword,
      loading,
      errorKey: errors.errorKey,
      toastKey: errors.toastKey,
      fieldErrors: errors.fieldErrors,
      tokenValid,
      validateToken,
      submit,
    };
  };
}
