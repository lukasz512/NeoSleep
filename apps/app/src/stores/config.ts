import { createConfigStore } from "@neo/stores";
import { apiFetch } from "../utils/api";
import { applyI18nOverrides } from "../plugins/i18n";

export type { AppConfig, ConfigOption, ConfigOptions } from "@neo/stores";

export const useConfigStore = createConfigStore(apiFetch, applyI18nOverrides);
