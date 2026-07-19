import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useTheme } from "vuetify";
import { useDebounceFn } from "@vueuse/core";
import { useThemeStore } from "@stores";
import { SIDEBAR_DEFAULT_COLLAPSED, MOBILE_BREAKPOINT } from "../constants";
import { getUserSettings, setUserSettings } from "../utils/user-settings";
import { getInitials } from "../utils/initials";
import { lightTheme, darkTheme } from "../plugins/vuetify";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { loadLocale } from "../plugins/i18n";

export function useLayoutState() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const authStore = useAuthStore();
  const configStore = useConfigStore();
  const vuetifyTheme = useTheme();

  // ── Theme ──────────────────────────────────────────────────────────────────
  // All resolution/persistence lives in the shared store (packages/stores/theme.ts)
  // — including data-theme on <html>. Only the Vuetify-specific side effect
  // (pwa only, not shared) lives here.
  const themeStore = useThemeStore();
  const theme = computed(() => themeStore.mode);

  watch(
    theme,
    (mode) => vuetifyTheme.change(mode === "dark" ? darkTheme : lightTheme),
    { immediate: true, flush: "sync" }
  );

  function setTheme(id: "light" | "dark") {
    themeStore.setPreference(id);
  }

  function toggleTheme() {
    themeStore.toggleMode();
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────
  const sidebarCollapsed = ref(SIDEBAR_DEFAULT_COLLAPSED);

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    setUserSettings({ sidebarCollapsed: sidebarCollapsed.value });
  }

  // ── Mobile ─────────────────────────────────────────────────────────────────
  const isMobile = ref(false);
  const mobileDrawerOpen = ref(false);

  const updateMobile = useDebounceFn(() => {
    if (typeof window === "undefined") return;
    isMobile.value = window.innerWidth < MOBILE_BREAKPOINT;
    if (!isMobile.value) {
      mobileDrawerOpen.value = false;
    }
  }, 150);

  // ── User info ──────────────────────────────────────────────────────────────
  const userDisplayName = computed(
    () => authStore.displayName ?? authStore.user?.email ?? t("user.user.placeholderName"),
  );

  const userRole = computed(() => {
    const role = authStore.user?.role;
    if (role === "admin") return t("user.user.roleAdmin");
    if (role === "manager") return t("user.user.roleManager");
    if (role === "kam") return t("user.user.roleKam");
    if (role === "msl") return t("user.user.roleMsl");
    if (role === "rep") return t("user.user.roleRep");
    if (role === "doctor") return t("user.user.roleDoctor");
    return t("user.user.role");
  });

  const userInitials = computed(() => getInitials(userDisplayName.value));

  // ── Locale ────────────────────────────────────────────────────────────────
  const localeTransitioning = ref(false);

  async function setLocale(lang: "en" | "pl" | "mx") {
    localeTransitioning.value = true;
    await new Promise<void>((r) => setTimeout(r, 180));
    await loadLocale(lang);
    locale.value = lang;
    setUserSettings({ locale: lang });
    await nextTick();
    localeTransitioning.value = false;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function onLogout() {
    mobileDrawerOpen.value = false;
    await authStore.logout();
    router.push("/login");
  }

  // ── Accessibility ─────────────────────────────────────────────────────────
  function focusMainContent() {
    const el = document.getElementById("main-content");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.focus({ preventScroll: false });
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onMounted(async () => {
    const settings = getUserSettings();
    if (typeof settings.sidebarCollapsed === "boolean") {
      sidebarCollapsed.value = settings.sidebarCollapsed;
    }
    const [cfg] = await Promise.all([configStore.load(), configStore.loadOptions(), configStore.loadI18nOverrides()]);
    configStore.applyToDom(cfg);
    // NOTE: configStore.load() already feeds cfg.color_scheme into the theme
    // store's tenant-default tier — no setTheme() call here. Calling it would
    // override the user's own explicit choice on every mount, which was the
    // pre-existing bug this migration fixes (personal theme preference never
    // actually persisted across reloads).
    updateMobile();
    window.addEventListener("resize", updateMobile);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", updateMobile);
  });

  const user = computed(() => ({
    displayName: userDisplayName.value,
    role: userRole.value,
    initials: userInitials.value,
  }));

  return {
    theme, toggleTheme, setTheme,
    sidebarCollapsed, toggleSidebar,
    isMobile, mobileDrawerOpen,
    user,
    locale, localeTransitioning, setLocale,
    onLogout,
    focusMainContent,
  };
}
