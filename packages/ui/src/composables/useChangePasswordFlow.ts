import { ref } from "vue";
import { useRouter } from "vue-router";
import { reportCaught, reportFailedResponse, type ApiFetchOptions } from "@api";
import type { AuthTokenStorage } from "@stores";
import { applyCaughtError, applyFailedResponse, clearFlowErrors, createFlowErrors } from "./flowErrors";

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;

/** Query flag AuthView reads to show "Password changed, sign in again". */
export const PASSWORD_CHANGED_NOTICE = "password-changed";

/** `?from=` value the account menu opens /change-password with — the one
 *  case where the page offers Cancel (a forced change on login can't be skipped). */
export const CHANGE_PASSWORD_FROM_MENU = "menu";

export function createUseChangePasswordFlow(apiFetch: ApiFetchFn, tokenStorage: AuthTokenStorage) {
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

        // The server signs this account out everywhere on a password change,
        // this device included (token_version + refresh tokens, ADR-020), so
        // the tokens we hold are dead. Drop them and reload into the login
        // screen — a full load also clears the in-memory user — instead of
        // routing into the app only to be bounced out by the first 401.
        tokenStorage.setAccessToken(null);
        tokenStorage.setRefreshToken(null);
        window.location.assign(router.resolve({ path: "/login", query: { notice: PASSWORD_CHANGED_NOTICE } }).href);
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
