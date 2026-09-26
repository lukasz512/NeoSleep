import { ref } from "vue";
import { useRouter } from "vue-router";
import { errorBodyKeyOr, reportCaught, reportFailedResponse, type ApiFetchOptions } from "@api";
import type { AuthTokenStorage } from "@stores";

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
          const failure = await reportFailedResponse(res, { where: "useChangePasswordFlow.submit" });
          errorKey.value = errorBodyKeyOr(failure, "user.changePassword.error.network");
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
        errorKey.value = errorBodyKeyOr(err, "user.changePassword.error.network");
      } finally {
        loading.value = false;
      }
    }

    return { currentPassword, newPassword, loading, errorKey, submit };
  };
}
