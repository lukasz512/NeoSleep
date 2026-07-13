import { ref } from "vue";

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

function resolveDark(mode: ThemeMode): boolean {
  return mode === "auto" ? getSystemDark() : mode === "dark";
}

function applyTheme(dark: boolean) {
  if (typeof document === "undefined") return;
  if (dark) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  const iconPath = dark
    ? "/brand/logos/icon/icon_dark.svg"
    : "/brand/logos/icon/icon_light.svg";
  setFavicon(iconPath);
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

// ── Singleton state (module-level — initialised once) ──────────────────────
const themeMode = ref<ThemeMode>(getStored() ?? "auto");
const isDark = ref<boolean>(resolveDark(themeMode.value));

// Apply on first load (runs once when the module is imported)
if (typeof document !== "undefined") {
  applyTheme(isDark.value);
}

// React to OS preference changes when mode is "auto"
if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (themeMode.value === "auto") {
        isDark.value = e.matches;
        applyTheme(isDark.value);
      }
    });
}

// ── Public API ─────────────────────────────────────────────────────────────
export function useTheme() {
  function setTheme(mode: ThemeMode) {
    themeMode.value = mode;
    isDark.value = resolveDark(mode);
    applyTheme(isDark.value);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (_) {}
  }

  function cycleTheme() {
    const order: ThemeMode[] = ["auto", "light", "dark"];
    const i = order.indexOf(themeMode.value);
    setTheme(order[(i + 1) % order.length]);
  }

  return { isDark, themeMode, setTheme, cycleTheme };
}
