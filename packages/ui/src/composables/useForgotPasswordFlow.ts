import { ref } from "vue";
import { useRoute } from "vue-router";
import { reportCaught, reportFailedResponse, type ApiFetchOptions } from "@api";
import { applyCaughtError, applyFailedResponse, clearFlowErrors, createFlowErrors } from "./flowErrors";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

export function createUseForgotPasswordFlow(apiFetch: ApiFetchFn) {
  return function useForgotPasswordFlow() {
    const route = useRoute();

    // Carried over from the login form (see LoginView's forgotPasswordRoute)
    // so the user isn't asked to retype an email they already entered.
    const prefillEmail = typeof route.query.email === "string" ? route.query.email : "";
    const email = ref(prefillEmail);
    const loading = ref(false);
    // NEO-109: errorKey = a line in the form's summary box, toastKey = a toast
    // (connection / server only), fieldErrors = fields the API rejected.
    const errors = createFlowErrors();
    const submitted = ref(false);

    async function submit(): Promise<void> {
      clearFlowErrors(errors);
      loading.value = true;
      try {
        const res = await apiFetch("/api/v1/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.value.trim().toLowerCase() }),
          handleErrors: false,
        });

        if (!res.ok) {
          const failure = await reportFailedResponse(res, { where: "useForgotPasswordFlow.submit" });
          await applyFailedResponse(errors, res, failure, "user.forgotPassword.error.network");
          return;
        }

        // Backend always responds 200 with a generic message regardless of
        // whether the account exists, so the UI can't distinguish either —
        // that's intentional, it prevents email enumeration.
        submitted.value = true;
      } catch (err) {
        reportCaught(err, { where: "useForgotPasswordFlow.submit" });
        applyCaughtError(errors, err, "user.forgotPassword.error.network");
      } finally {
        loading.value = false;
      }
    }

    return {
      email,
      loading,
      errorKey: errors.errorKey,
      toastKey: errors.toastKey,
      fieldErrors: errors.fieldErrors,
      submitted,
      submit,
    };
  };
}
