import { computed, inject, type ComputedRef } from "vue";
import { useI18n } from "vue-i18n";
import { APP_VERSION_KEY } from "@stores";

/** "Version 1.0.0 (build 12) · DEV" — prod shows no channel suffix. Shared by
 *  the login badge (AuthView) and the in-app corner label (apps/pwa AppLayout),
 *  so both always read the same. Empty string when the app provides no
 *  APP_VERSION_KEY, so callers can just v-if on it. */
export function useAppVersionLabel(): ComputedRef<string> {
  const { t } = useI18n();
  const appVersion = inject(APP_VERSION_KEY, undefined);
  return computed(() => {
    if (!appVersion) return "";
    const { version, build, channel } = appVersion;
    const base = build === null
      ? t("user.login.appVersion", { version })
      : t("user.login.appVersionBuild", { version, build });
    if (channel === "prod") return base;
    const channelLabel = channel === "dev" ? t("user.login.appChannelDev") : t("user.login.appChannelLocal");
    return t("user.login.appVersionWithChannel", { version: base, channel: channelLabel });
  });
}
