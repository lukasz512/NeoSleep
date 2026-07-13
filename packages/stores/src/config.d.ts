import type { ApiFetchOptions } from "@api";
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
type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;
type I18nOverrideFn = (overrides: Record<string, Record<string, string>>) => void;
/**
 * Factory for the config store. Pass the app's apiFetch wrapper and optionally
 * an i18n override function to apply DB label overrides on load.
 *
 * @example
 * // apps/app/src/stores/config.ts
 * import { createConfigStore } from "@stores";
 * import { apiFetch } from "../utils/api";
 * import { applyI18nOverrides } from "../plugins/i18n";
 * export const useConfigStore = createConfigStore(apiFetch, applyI18nOverrides);
 */
export declare function createConfigStore(apiFetch: ApiFetchFn, applyI18nOverrides?: I18nOverrideFn): import("pinia").StoreDefinition<"config", Pick<{
    config: import("vue").ShallowRef<AppConfig, AppConfig>;
    loading: import("vue").Ref<boolean, boolean>;
    defaults: AppConfig;
    load: () => Promise<AppConfig>;
    save: (updates: Partial<AppConfig>) => Promise<AppConfig | null>;
    applyToDom: (cfg: AppConfig) => void;
    options: import("vue").ShallowRef<ConfigOptions, ConfigOptions>;
    loadOptions: () => Promise<ConfigOptions>;
    loadI18nOverrides: () => Promise<void>;
    regionItems: import("vue").ComputedRef<{
        title: string;
        value: string;
    }[]>;
    specialtyItems: import("vue").ComputedRef<{
        title: string;
        value: string;
    }[]>;
    institutionTypeItems: import("vue").ComputedRef<{
        title: string;
        value: string;
    }[]>;
}, "config" | "loading" | "defaults" | "options">, Pick<{
    config: import("vue").ShallowRef<AppConfig, AppConfig>;
    loading: import("vue").Ref<boolean, boolean>;
    defaults: AppConfig;
    load: () => Promise<AppConfig>;
    save: (updates: Partial<AppConfig>) => Promise<AppConfig | null>;
    applyToDom: (cfg: AppConfig) => void;
    options: import("vue").ShallowRef<ConfigOptions, ConfigOptions>;
    loadOptions: () => Promise<ConfigOptions>;
    loadI18nOverrides: () => Promise<void>;
    regionItems: import("vue").ComputedRef<{
        title: string;
        value: string;
    }[]>;
    specialtyItems: import("vue").ComputedRef<{
        title: string;
        value: string;
    }[]>;
    institutionTypeItems: import("vue").ComputedRef<{
        title: string;
        value: string;
    }[]>;
}, "regionItems" | "specialtyItems" | "institutionTypeItems">, Pick<{
    config: import("vue").ShallowRef<AppConfig, AppConfig>;
    loading: import("vue").Ref<boolean, boolean>;
    defaults: AppConfig;
    load: () => Promise<AppConfig>;
    save: (updates: Partial<AppConfig>) => Promise<AppConfig | null>;
    applyToDom: (cfg: AppConfig) => void;
    options: import("vue").ShallowRef<ConfigOptions, ConfigOptions>;
    loadOptions: () => Promise<ConfigOptions>;
    loadI18nOverrides: () => Promise<void>;
    regionItems: import("vue").ComputedRef<{
        title: string;
        value: string;
    }[]>;
    specialtyItems: import("vue").ComputedRef<{
        title: string;
        value: string;
    }[]>;
    institutionTypeItems: import("vue").ComputedRef<{
        title: string;
        value: string;
    }[]>;
}, "load" | "save" | "applyToDom" | "loadOptions" | "loadI18nOverrides">>;
export {};
