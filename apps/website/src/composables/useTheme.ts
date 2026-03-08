import { ref, onMounted } from "vue";

const STORAGE_KEY = "neosleep-website-theme";
export type ThemeMode = "light" | "dark";

function getStored(): ThemeMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch (_) {}
  return null;
}

function getInitialDark(): boolean {
  const stored = getStored();
  if (stored !== null) return stored === "dark";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) return true;
  return false;
}

const isDark = ref<boolean>(getInitialDark());

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  if (dark) {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
}

export function useTheme() {
  function setTheme(mode: ThemeMode) {
    isDark.value = mode === "dark";
    applyTheme(isDark.value);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (_) {}
  }

  function toggle() {
    setTheme(isDark.value ? "light" : "dark");
  }

  onMounted(() => {
    const stored = getStored();
    if (stored !== null) {
      isDark.value = stored === "dark";
    } else {
      isDark.value = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    applyTheme(isDark.value);
  });

  return {
    isDark,
    setTheme,
    toggle,
  };
}
