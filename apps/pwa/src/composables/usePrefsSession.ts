/**
 * Ties @neo/prefs to the auth session (CORE-45): tells it who is signed in, so every
 * list's remembered filters/sort come from that person's own slot on this device.
 * On sign-in it also moves the old device-wide filters over (once), forgets anyone's
 * settings unused for 90 days, and switches to the person's own language.
 */
import { watch } from "vue";
import { setPrefsIdentity, pruneExpired, browserStorage } from "@prefs";
import { useAuthStore } from "../stores/auth";
import { i18n, loadLocale } from "../plugins/i18n";
import { setUserSettings } from "../utils/user-settings";
import { migrateLegacyFilters, readUserLocale } from "../utils/prefsSession";

export function setupPrefsSession(): void {
  const authStore = useAuthStore();

  watch(
    () => (authStore.user?.tenant && authStore.user.id ? `${authStore.user.tenant}:${authStore.user.id}` : null),
    async () => {
      const user = authStore.user;
      const id = user?.tenant && user.id ? { tenant: user.tenant, userId: user.id } : null;
      if (id) {
        migrateLegacyFilters(id);
        pruneExpired(browserStorage());
      }
      setPrefsIdentity(id);
      const locale = id ? readUserLocale(id) : null;
      if (locale && locale !== i18n.global.locale.value) {
        await loadLocale(locale);
        i18n.global.locale.value = locale;
        // The device remembers the last language used, so the login screen speaks it next time.
        setUserSettings({ locale });
      }
    },
    { immediate: true },
  );
}
