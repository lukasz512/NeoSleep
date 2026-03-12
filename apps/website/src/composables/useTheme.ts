import { ref, onMounted } from "vue";

const STORAGE_KEY = "neosleep-website-theme";
export type ThemeMode = "light" | "dark" | "auto";

function getStored(): ThemeMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch (_) {}
  return null;
}

function getSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getInitialMode(): ThemeMode {
  const stored = getStored();
  if (stored !== null) return stored;
  return "auto";
}

function resolveDark(mode: ThemeMode): boolean {
  if (mode === "auto") return getSystemDark();
  return mode === "dark";
}

const themeMode = ref<ThemeMode>(getInitialMode());
const isDark = ref<boolean>(resolveDark(themeMode.value));

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  if (dark) {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
  if (typeof document !== "undefined") {
    const iconPath = dark ? "/brand/logos/icon/icon_dark.svg" : "/brand/logos/icon/icon_light.svg";
    setFavicon(iconPath);
  }
}

function setFavicon(href: string) {
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

let systemQuery: MediaQueryList | null = null;
let systemListener: (() => void) | null = null;

function ensureSystemListener() {
  if (systemQuery && systemListener) return;
  if (typeof window === "undefined") return;
  systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
  systemListener = () => {
    if (themeMode.value === "auto") {
      isDark.value = systemQuery!.matches;
      applyTheme(isDark.value);
    }
  };
  systemQuery.addEventListener("change", systemListener);
}

function removeSystemListener() {
  if (systemQuery && systemListener) {
    systemQuery.removeEventListener("change", systemListener);
    systemQuery = null;
    systemListener = null;
  }
}

export function useTheme() {
  function setTheme(mode: ThemeMode) {
    themeMode.value = mode;
    if (mode === "auto") {
      isDark.value = getSystemDark();
      applyTheme(isDark.value);
      ensureSystemListener();
    } else {
      removeSystemListener();
      isDark.value = mode === "dark";
      applyTheme(isDark.value);
    }
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (_) {}
  }

  function cycleTheme() {
    const order: ThemeMode[] = ["auto", "light", "dark"];
    const i = order.indexOf(themeMode.value);
    setTheme(order[(i + 1) % order.length]);
  }

  onMounted(() => {
    const mode = getInitialMode();
    themeMode.value = mode;
    isDark.value = resolveDark(mode);
    applyTheme(isDark.value);
    if (mode === "auto") ensureSystemListener();
  });

  return {
    isDark,
    themeMode,
    setTheme,
    cycleTheme,
  };
}
