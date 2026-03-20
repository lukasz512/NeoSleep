import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useTheme } from "vuetify";
import { useDebounceFn } from "@vueuse/core";
import { SIDEBAR_DEFAULT_COLLAPSED, MOBILE_BREAKPOINT } from "../constants";
import { getNextTheme } from "../utils/theme";
import { getRepSettings, setRepSettings } from "../utils/rep-settings";
import { repLightTheme, repDarkTheme } from "../plugins/vuetify";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { loadLocale } from "../plugins/i18n";
import type { AppConfig } from "../stores/config";

export function useLayoutState() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const authStore = useAuthStore();
  const configStore = useConfigStore();
  const vuetifyTheme = useTheme();

  // ── Theme ──────────────────────────────────────────────────────────────────
  const theme = ref<"light" | "dark">("light");

  function setTheme(id: "light" | "dark") {
    theme.value = id;
    vuetifyTheme.change(id === "dark" ? repDarkTheme : repLightTheme);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", id);
      setRepSettings({ theme: id });
    }
  }

  function toggleTheme() {
    setTheme(getNextTheme(theme.value));
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────
  const sidebarCollapsed = ref(SIDEBAR_DEFAULT_COLLAPSED);

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    setRepSettings({ sidebarCollapsed: sidebarCollapsed.value });
  }

  // ── Mobile ─────────────────────────────────────────────────────────────────
  const isMobile = ref(false);
  const mobileDrawerOpen = ref(false);
  const mobileDrawerUserMenuOpen = ref(false);

  const updateMobile = useDebounceFn(() => {
    if (typeof window === "undefined") return;
    isMobile.value = window.innerWidth < MOBILE_BREAKPOINT;
    if (!isMobile.value) {
      mobileDrawerOpen.value = false;
      mobileDrawerUserMenuOpen.value = false;
    }
  }, 150);

  // ── User info ──────────────────────────────────────────────────────────────
  const isAdmin = computed(() => authStore.user?.role === "admin");

  const userDisplayName = computed(
    () => authStore.displayName ?? authStore.user?.email ?? t("rep.user.placeholderName"),
  );

  const userRole = computed(() => {
    const role = authStore.user?.role;
    if (role === "admin") return t("rep.user.roleAdmin");
    if (role === "manager") return t("rep.user.roleManager");
    if (role === "rep") return t("rep.user.roleRep");
    return t("rep.user.role");
  });

  const userInitials = computed(() => {
    const name = userDisplayName.value;
    const parts = name
      .trim()
      .split(/\s+/)
      .filter((w) => /^[a-zA-ZÀ-žżźćńółęąśŻŹĆŃÓŁĘĄŚ]/.test(w));
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return "?";
  });

  // ── Locale ────────────────────────────────────────────────────────────────
  const localeTransitioning = ref(false);

  async function setLocale(lang: "en" | "pl" | "mx") {
    localeTransitioning.value = true;
    await new Promise<void>((r) => setTimeout(r, 180));
    await loadLocale(lang);
    locale.value = lang;
    setRepSettings({ locale: lang });
    await nextTick();
    localeTransitioning.value = false;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  function onLogout() {
    mobileDrawerUserMenuOpen.value = false;
    mobileDrawerOpen.value = false;
    authStore.clearAuth();
    router.push("/login");
  }

  // ── Theme panel ───────────────────────────────────────────────────────────
  const themePanelOpen = ref(false);
  const themePanelConfig = computed(() => configStore.config ?? configStore.defaults);

  async function onThemeSave(cfg: AppConfig) {
    const updated = await configStore.save(cfg);
    if (!updated) return null;
    const fromDb = await configStore.load();
    configStore.applyToDom(fromDb);
    setTheme(fromDb.color_scheme);
    return fromDb;
  }

  function onOpenThemePanelFromDrawer() {
    themePanelOpen.value = true;
    mobileDrawerUserMenuOpen.value = false;
    nextTick(() => {
      mobileDrawerOpen.value = false;
    });
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
    const settings = getRepSettings();
    if (typeof settings.sidebarCollapsed === "boolean") {
      sidebarCollapsed.value = settings.sidebarCollapsed;
    }
    const [cfg] = await Promise.all([configStore.load(), configStore.loadOptions(), configStore.loadI18nOverrides()]);
    configStore.applyToDom(cfg);
    setTheme(cfg.color_scheme);
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
    isMobile, mobileDrawerOpen, mobileDrawerUserMenuOpen,
    isAdmin, user,
    locale, localeTransitioning, setLocale,
    onLogout,
    themePanelOpen, themePanelConfig, onThemeSave, onOpenThemePanelFromDrawer,
    focusMainContent,
  };
}
