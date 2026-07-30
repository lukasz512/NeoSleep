import { createConfigStore } from "@stores";
import { apiFetch } from "../composables/useBffApi";
import { applyI18nOverrides } from "../plugins/i18n";

export type { AppConfig, ConfigOption, ConfigOptions } from "@stores";

export const useConfigStore = createConfigStore(apiFetch, applyI18nOverrides);
