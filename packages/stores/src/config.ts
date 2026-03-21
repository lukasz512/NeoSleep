import { defineStore } from "pinia";
import { ref, shallowRef, computed } from "vue";
import { brandColors } from "@neo/brand/colors";
import type { ApiFetchOptions } from "@neo/api";

export interface ConfigOption {
  id: string;
  type: "region" | "specialty" | "institution_type";
  value: string;
  label: string;
  sort_order: number;
}

export interface ConfigOptions {
  regions: ConfigOption[];
  specialties: ConfigOption[];
  institution_types: ConfigOption[];
}

const EMPTY_OPTIONS: ConfigOptions = { regions: [], specialties: [], institution_types: [] };

export interface AppConfig {
  primary_color: string;
  secondary_color: string;
  primary_color_dark: string;
  secondary_color_dark: string;
  border_radius: string;
  logo_url: string | null;
  surface_color: string;
  color_scheme: "light" | "dark";
}

const defaults: AppConfig = {
  primary_color:      brandColors.primary,
  secondary_color:    brandColors.primaryLight,
  primary_color_dark: brandColors.primaryOnDark,
  secondary_color_dark: brandColors.primaryOnDark,
  border_radius:      "8px",
  logo_url:           null,
  surface_color:      "#fafafa",
  color_scheme:       "light",
};

function normalizeHex(s: string | undefined | null): string | undefined {
  if (typeof s !== "string" || !s.trim()) return undefined;
  const t = s.trim();
  return t.startsWith("#") ? t.toLowerCase() : t;
}

type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;
type I18nOverrideFn = (overrides: Record<string, Record<string, string>>) => void;

/**
 * Factory for the config store. Pass the app's apiFetch wrapper and optionally
 * an i18n override function to apply DB label overrides on load.
 *
 * @example
 * // apps/app/src/stores/config.ts
 * import { createConfigStore } from "@neo/stores";
 * import { apiFetch } from "../utils/api";
 * import { applyI18nOverrides } from "../plugins/i18n";
 * export const useConfigStore = createConfigStore(apiFetch, applyI18nOverrides);
 */
export function createConfigStore(apiFetch: ApiFetchFn, applyI18nOverrides?: I18nOverrideFn) {
  return defineStore("config", () => {
    const config = shallowRef<AppConfig>({ ...defaults });
    const options = shallowRef<ConfigOptions>({ ...EMPTY_OPTIONS });
    const loading = ref(false);

    async function load(): Promise<AppConfig> {
      loading.value = true;
      try {
        const res = await apiFetch("/api/config/app", { handleErrors: false });
        if (!res.ok) {
          config.value = { ...defaults };
          return config.value;
        }
        const data = (await res.json()) as Partial<AppConfig>;
        config.value = {
          primary_color:       normalizeHex(data.primary_color)       ?? defaults.primary_color,
          secondary_color:     normalizeHex(data.secondary_color)     ?? defaults.secondary_color,
          primary_color_dark:  normalizeHex(data.primary_color_dark)  ?? defaults.primary_color_dark,
          secondary_color_dark:normalizeHex(data.secondary_color_dark)?? defaults.secondary_color_dark,
          border_radius:       data.border_radius  ?? defaults.border_radius,
          logo_url:            data.logo_url       ?? null,
          surface_color:       normalizeHex(data.surface_color)       ?? defaults.surface_color,
          color_scheme:        data.color_scheme === "dark" ? "dark" : "light",
        };
        return config.value;
      } finally {
        loading.value = false;
      }
    }

    async function save(updates: Partial<AppConfig>): Promise<AppConfig | null> {
      loading.value = true;
      try {
        const res = await apiFetch("/api/config/app", {
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
            primary_color:       normalizeHex(data.primary_color)        ?? data.primary_color       ?? defaults.primary_color,
            secondary_color:     normalizeHex(data.secondary_color)      ?? data.secondary_color     ?? defaults.secondary_color,
            primary_color_dark:  normalizeHex(data.primary_color_dark)   ?? data.primary_color_dark  ?? defaults.primary_color_dark,
            secondary_color_dark:normalizeHex(data.secondary_color_dark) ?? data.secondary_color_dark?? defaults.secondary_color_dark,
            surface_color:       normalizeHex(data.surface_color)        ?? data.surface_color       ?? defaults.surface_color,
          };
        }
        return config.value;
      } finally {
        loading.value = false;
      }
    }

    async function loadI18nOverrides(): Promise<void> {
      if (!applyI18nOverrides) return;
      try {
        const res = await apiFetch("/api/config/i18n", { handleErrors: false });
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, Record<string, string>>;
        applyI18nOverrides(data);
      } catch {
        // Non-fatal — static JSON is the fallback
      }
    }

    async function loadOptions(): Promise<ConfigOptions> {
      try {
        const res = await apiFetch("/api/config/options", { handleErrors: false });
        if (!res.ok) return options.value;
        const data = (await res.json()) as ConfigOptions;
        options.value = {
          regions:          Array.isArray(data.regions)          ? data.regions          : [],
          specialties:      Array.isArray(data.specialties)      ? data.specialties      : [],
          institution_types:Array.isArray(data.institution_types)? data.institution_types: [],
        };
        return options.value;
      } catch {
        return options.value;
      }
    }

    const regionItems = computed(() =>
      options.value.regions.map((o) => ({ title: o.label, value: o.value }))
    );
    const specialtyItems = computed(() =>
      options.value.specialties.map((o) => ({ title: o.label, value: o.value }))
    );
    const institutionTypeItems = computed(() =>
      options.value.institution_types.map((o) => ({ title: o.label, value: o.value }))
    );

    function applyToDom(cfg: AppConfig) {
      if (typeof document === "undefined" || !document.documentElement) return;
      const root = document.documentElement;
      root.style.setProperty("--rep-primary",        cfg.primary_color);
      root.style.setProperty("--rep-primary-hover",  cfg.primary_color);
      root.style.setProperty("--rep-secondary",      cfg.secondary_color);
      root.style.setProperty("--rep-primary-dark",   cfg.primary_color_dark);
      root.style.setProperty("--rep-secondary-dark", cfg.secondary_color_dark);
      root.style.setProperty("--rep-surface",        cfg.surface_color);
      root.style.setProperty("--rep-bg-secondary",   cfg.surface_color);
      root.setAttribute("data-theme", cfg.color_scheme);
    }

    return {
      config, loading, defaults, load, save, applyToDom,
      options, loadOptions, loadI18nOverrides, regionItems, specialtyItems, institutionTypeItems,
    };
  });
}
