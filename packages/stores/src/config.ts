import { defineStore } from "pinia";
import { ref, shallowRef, computed } from "vue";
import { brandColors } from "@brand/colors";
import type { ApiFetchOptions } from "@api";
import { useThemeStore } from "./theme";

/** Matches the API's LookupItem shape (apps/api/src/db/lookup.ts) — key is the stable
 *  machine value to store/filter by, value is the translated display label. */
export interface ConfigOption {
  key: string;
  value: string;
  locale: string;
  sort_order: number;
  locked: boolean;
  custom: boolean;
}

export interface ConfigOptions {
  regions: ConfigOption[];
  specialties: ConfigOption[];
  organization_types: ConfigOption[];
}

const EMPTY_OPTIONS: ConfigOptions = { regions: [], specialties: [], organization_types: [] };

export interface AppConfig {
  primary_color: string;
  secondary_color: string;
  primary_color_dark: string;
  secondary_color_dark: string;
  border_radius: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  icon_url: string | null;
  icon_dark_url: string | null;
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
  logo_dark_url:      null,
  icon_url:           null,
  icon_dark_url:      null,
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
 * // apps/pwa/src/stores/config.ts
 * import { createConfigStore } from "@stores";
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
        const res = await apiFetch("/api/v1/config/app", { handleErrors: false });
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
          logo_dark_url:       data.logo_dark_url  ?? null,
          icon_url:            data.icon_url       ?? null,
          icon_dark_url:       data.icon_dark_url  ?? null,
          surface_color:       normalizeHex(data.surface_color)       ?? defaults.surface_color,
          color_scheme:        data.color_scheme === "dark" ? "dark" : "light",
        };
        useThemeStore().setTenantDefault(config.value.color_scheme);
        return config.value;
      } finally {
        loading.value = false;
      }
    }

    async function save(updates: Partial<AppConfig>): Promise<AppConfig | null> {
      loading.value = true;
      try {
        const res = await apiFetch("/api/v1/config/app", {
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
          useThemeStore().setTenantDefault(config.value.color_scheme);
        }
        return config.value;
      } finally {
        loading.value = false;
      }
    }

    async function loadI18nOverrides(): Promise<void> {
      if (!applyI18nOverrides) return;
      try {
        const res = await apiFetch("/api/v1/config/i18n", { handleErrors: false });
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, Record<string, string>>;
        applyI18nOverrides(data);
      } catch {
        // Non-fatal — static JSON is the fallback
      }
    }

    async function loadOptions(): Promise<ConfigOptions> {
      try {
        const res = await apiFetch("/api/v1/lookups/options", { handleErrors: false });
        if (!res.ok) return options.value;
        const data = (await res.json()) as ConfigOptions;
        options.value = {
          regions:           Array.isArray(data.regions)           ? data.regions           : [],
          specialties:       Array.isArray(data.specialties)       ? data.specialties       : [],
          organization_types:Array.isArray(data.organization_types)? data.organization_types : [],
        };
        return options.value;
      } catch {
        return options.value;
      }
    }

    const regionItems = computed(() =>
      options.value.regions.map((o) => ({ title: o.value, value: o.key }))
    );
    const specialtyItems = computed(() =>
      options.value.specialties.map((o) => ({ title: o.value, value: o.key }))
    );
    const institutionTypeItems = computed(() =>
      options.value.organization_types.map((o) => ({ title: o.value, value: o.key }))
    );

    function applyToDom(cfg: AppConfig) {
      if (typeof document === "undefined" || !document.documentElement) return;
      const root = document.documentElement;
      root.style.setProperty("--pwa-primary",        cfg.primary_color);
      root.style.setProperty("--pwa-primary-hover",  cfg.primary_color);
      root.style.setProperty("--pwa-secondary",      cfg.secondary_color);
      root.style.setProperty("--pwa-primary-dark",   cfg.primary_color_dark);
      root.style.setProperty("--pwa-secondary-dark", cfg.secondary_color_dark);
      root.style.setProperty("--pwa-surface",        cfg.surface_color);
      root.style.setProperty("--pwa-bg-secondary",   cfg.surface_color);
      // data-theme is owned by useThemeStore (packages/stores/theme.ts), not here —
      // color_scheme only feeds its tenant-default tier via setTenantDefault() above.
    }

    return {
      config, loading, defaults, load, save, applyToDom,
      options, loadOptions, loadI18nOverrides, regionItems, specialtyItems, institutionTypeItems,
    };
  });
}
