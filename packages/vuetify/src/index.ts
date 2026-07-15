/**
 * Shared Vuetify 3 factory for NeoSleep apps.
 *
 * Usage in plugins/vuetify.ts:
 *   import { createNeoVuetify } from "@vuetify";
 *   import { createVueI18nAdapter } from "vuetify/locale/adapters/vue-i18n";
 *   import { useI18n } from "vue-i18n";
 *   import { i18n } from "./i18n";
 *   export default createNeoVuetify({ i18n, useI18n }, { colors: { ... } });
 */
import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import { createVuetify } from "vuetify";
import { VuetifyDateAdapter } from "vuetify/date/adapters/vuetify";
import { createVueI18nAdapter } from "vuetify/locale/adapters/vue-i18n";
import { en as vuetifyEn, pl as vuetifyPl, es as vuetifyEs } from "vuetify/locale";

/** Vuetify's own built-in translations (dialog labels, pagination, etc.) for NeoSleep's 3 supported locales. */
export const vuetifyLocales: Record<"en" | "pl" | "mx", Record<string, unknown>> = {
  en: vuetifyEn,
  pl: vuetifyPl,
  mx: vuetifyEs,
};

export interface NeoVuetifyColors {
  lightPrimary: string;
  lightPrimaryDarken: string;
  darkPrimary: string;
  darkPrimaryDarken: string;
}

export interface NeoVuetifyOptions {
  lightThemeName?: string;
  darkThemeName?: string;
  colors: NeoVuetifyColors;
}

export function createNeoVuetify(
  adapterInput: Parameters<typeof createVueI18nAdapter>[0],
  options: NeoVuetifyOptions,
) {
  const light = options.lightThemeName ?? "neoLight";
  const dark  = options.darkThemeName  ?? "neoDark";

  return createVuetify({
    date: { adapter: VuetifyDateAdapter },
    locale: { adapter: createVueI18nAdapter(adapterInput) },
    theme: {
      defaultTheme: light,
      themes: {
        [light]: {
          dark: false,
          colors: {
            primary:            options.colors.lightPrimary,
            "primary-darken-1": options.colors.lightPrimaryDarken,
          },
        },
        [dark]: {
          dark: true,
          colors: {
            primary:            options.colors.darkPrimary,
            "primary-darken-1": options.colors.darkPrimaryDarken,
          },
        },
      },
    },
  });
}
