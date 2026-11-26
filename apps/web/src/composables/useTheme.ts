import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useThemeStore, type ThemePreference } from "@stores";

export type ThemeMode = ThemePreference; // "light" | "dark" | "system"

const ICON_LIGHT = "/brand/logos/icon/icon_light.svg";
const ICON_DARK = "/brand/logos/icon/icon_dark.svg";

function setFavicon(href: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  let apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  if (!apple) {
    apple = document.createElement("link");
    apple.rel = "apple-touch-icon";
    document.head.appendChild(apple);
  }
  link.href = href;
  apple.href = href;
}

let faviconWatcherStarted = false;

/**
 * Thin wrapper over the shared theme store (packages/stores/theme.ts) — kept
 * so existing components (ThemeToggle.vue, MobileNavTheme.vue) keep the same
 * `useTheme()` call shape. All theme state and persistence lives in the store.
 *
 * Must only touch Pinia inside this function (called from component setup(),
 * after app.use(pinia)) — never at module top level, which runs at import
 * time before any Pinia instance exists.
 */
export function useTheme() {
  const store = useThemeStore();
  const { mode, preference } = storeToRefs(store);

  // Web-specific side effect only — the shared store already owns data-theme.
  if (!faviconWatcherStarted && typeof document !== "undefined") {
    faviconWatcherStarted = true;
    watch(
      mode,
      (m) => setFavicon(m === "dark" ? ICON_DARK : ICON_LIGHT),
      { immediate: true, flush: "sync" }
    );
  }

  return {
    isDark: computed(() => mode.value === "dark"),
    themeMode: preference,
    setTheme(m: ThemeMode) {
      store.setPreference(m);
    },
    cycleTheme() {
      store.cyclePreference();
    },
  };
}
