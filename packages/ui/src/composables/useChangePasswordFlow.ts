import { ref } from "vue";
import { useRouter } from "vue-router";
import { reportCaught, reportFailedResponse, type ApiFetchOptions } from "@api";
import { applyCaughtError, applyFailedResponse, clearFlowErrors, createFlowErrors } from "./flowErrors";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

export function createUseChangePasswordFlow(apiFetch: ApiFetchFn) {
  return function useChangePasswordFlow() {
    const router = useRouter();

    const currentPassword = ref("");
    const newPassword = ref("");
    const loading = ref(false);
    // NEO-109: errorKey = a line in the form's summary box, toastKey = a toast
    // (connection / server only), fieldErrors = fields the API rejected.
    const errors = createFlowErrors();

    async function submit(): Promise<void> {
      clearFlowErrors(errors);
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
          // The wrong current password is that field's problem — marked on it.
          errors.errorKey.value = "user.changePassword.error.incorrectCurrent";
          return;
        }
        if (!res.ok) {
          const failure = await reportFailedResponse(res, { where: "useChangePasswordFlow.submit" });
          await applyFailedResponse(errors, res, failure, "user.changePassword.error.network");
          return;
        }

        await router.push("/dashboard");
      } catch (err) {
        reportCaught(err, { where: "useChangePasswordFlow.submit" });
        applyCaughtError(errors, err, "user.changePassword.error.network");
      } finally {
        loading.value = false;
      }
    }

    return {
      currentPassword,
      newPassword,
      loading,
      errorKey: errors.errorKey,
      toastKey: errors.toastKey,
      fieldErrors: errors.fieldErrors,
      submit,
    };
  };
}
