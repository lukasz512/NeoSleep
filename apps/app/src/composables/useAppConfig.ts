/**
 * App-wide theme config from BFF (GET /api/config/app). Used by theme panel and layout to apply primary/surface/theme.
 */
import { ref, shallowRef } from "vue";
import { brandColors } from "@brand/colors";
import { bffFetch } from "./useBffApi";

export interface AppConfig {
  primary_color: string;
  secondary_color: string;
  primary_color_dark: string;
  secondary_color_dark: string;
  border_radius: string;
  logo_url: string | null;
  surface_color: string;
  hero_container_style: "compact" | "wide";
  color_scheme: "light" | "dark";
}

const defaults: AppConfig = {
  primary_color: brandColors.primary,
  secondary_color: brandColors.primaryLight,
  primary_color_dark: brandColors.primaryOnDark,
  secondary_color_dark: brandColors.primaryOnDark,
  border_radius: "8px",
  logo_url: null,
  surface_color: "#fafafa",
  hero_container_style: "compact",
  color_scheme: "light",
};

function normalizeHex(s: string | undefined | null): string | undefined {
  if (typeof s !== "string" || !s.trim()) return undefined;
  const t = s.trim();
  return t.startsWith("#") ? t.toLowerCase() : t;
}

export function useAppConfig() {
  const config = shallowRef<AppConfig>({ ...defaults });
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load(): Promise<AppConfig> {
    loading.value = true;
    error.value = null;
    try {
      const res = await bffFetch("/api/config/app", { handleErrors: false });
      if (!res.ok) {
        config.value = { ...defaults };
        return config.value;
      }
      const data = (await res.json()) as Partial<AppConfig>;
      config.value = {
        primary_color: normalizeHex(data.primary_color) ?? defaults.primary_color,
        secondary_color: normalizeHex(data.secondary_color) ?? defaults.secondary_color,
        primary_color_dark: normalizeHex(data.primary_color_dark) ?? defaults.primary_color_dark,
        secondary_color_dark: normalizeHex(data.secondary_color_dark) ?? defaults.secondary_color_dark,
        border_radius: data.border_radius ?? defaults.border_radius,
        logo_url: data.logo_url ?? null,
        surface_color: normalizeHex(data.surface_color) ?? defaults.surface_color,
        hero_container_style:
          data.hero_container_style === "wide" ? "wide" : "compact",
        color_scheme: data.color_scheme === "dark" ? "dark" : "light",
      };
      return config.value;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load config";
      config.value = { ...defaults };
      return config.value;
    } finally {
      loading.value = false;
    }
  }

  async function save(updates: Partial<AppConfig>): Promise<AppConfig | null> {
    loading.value = true;
    error.value = null;
    try {
      const res = await bffFetch("/api/config/app", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        handleErrors: true,
      });
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type");
      const hasJson = contentType?.includes("application/json");
      const data = hasJson ? ((await res.json()) as AppConfig) : null;
      if (data && typeof data === "object" && "primary_color" in data) {
        config.value = {
          ...data,
          primary_color: normalizeHex(data.primary_color) ?? data.primary_color ?? defaults.primary_color,
          secondary_color: normalizeHex(data.secondary_color) ?? data.secondary_color ?? defaults.secondary_color,
          primary_color_dark: normalizeHex(data.primary_color_dark) ?? data.primary_color_dark ?? defaults.primary_color_dark,
          secondary_color_dark: normalizeHex(data.secondary_color_dark) ?? data.secondary_color_dark ?? defaults.secondary_color_dark,
          surface_color: normalizeHex(data.surface_color) ?? data.surface_color ?? defaults.surface_color,
        };
      }
      return config.value;
    } catch {
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Apply config to the document: CSS variables and data attributes for theme/hero.
   * Call after load() or after save() to reflect changes.
   */
  function applyToDom(cfg: AppConfig) {
    if (typeof document === "undefined" || !document.documentElement) return;
    const root = document.documentElement;
    root.style.setProperty("--rep-primary", cfg.primary_color);
    root.style.setProperty("--rep-primary-hover", cfg.primary_color);
    root.style.setProperty("--rep-secondary", cfg.secondary_color);
    root.style.setProperty("--rep-primary-dark", cfg.primary_color_dark);
    root.style.setProperty("--rep-secondary-dark", cfg.secondary_color_dark);
    root.style.setProperty("--rep-surface", cfg.surface_color);
    root.style.setProperty("--rep-bg-secondary", cfg.surface_color);
    root.setAttribute("data-hero-container", cfg.hero_container_style);
    root.setAttribute("data-theme", cfg.color_scheme);
  }

  return { config, loading, error, load, save, applyToDom, defaults };
}
