import { computed, inject, type ComputedRef } from "vue";
import { useI18n } from "vue-i18n";
import { APP_VERSION_KEY } from "@stores";

export interface AppVersionParts {
  /** "Version 1.0.0 (build 12)" — empty when the app provides no APP_VERSION_KEY. */
  version: string;
  /** "DEV" / "LOCAL" on non-prod builds, null on prod. */
  channel: string | null;
}

/** The version and the channel as separate pieces, for places that show the
 *  channel on its own (apps/pwa: DEV badge by the logo, version at the foot
 *  of the account menu — NEO-102). */
export function useAppVersionParts(): ComputedRef<AppVersionParts> {
  const { t } = useI18n();
  const appVersion = inject(APP_VERSION_KEY, undefined);
  return computed(() => {
    if (!appVersion) return { version: "", channel: null };
    const { version, build, channel } = appVersion;
    const base = build === null
      ? t("user.login.appVersion", { version })
      : t("user.login.appVersionBuild", { version, build });
    if (channel === "prod") return { version: base, channel: null };
    return {
      version: base,
      channel: channel === "dev" ? t("user.login.appChannelDev") : t("user.login.appChannelLocal"),
    };
  });
}

/** "Version 1.0.0 (build 12) · DEV" — prod shows no channel suffix. Used by
 *  the login badge (AuthView). Empty string when the app provides no
 *  APP_VERSION_KEY, so callers can just v-if on it. */
export function useAppVersionLabel(): ComputedRef<string> {
  const { t } = useI18n();
  const parts = useAppVersionParts();
  return computed(() => {
    const { version, channel } = parts.value;
    if (!version || !channel) return version;
    return t("user.login.appVersionWithChannel", { version, channel });
  });
}
