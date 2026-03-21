/**
 * Shared Vuetify 3 factory for NeoSleep apps.
 *
 * Usage in plugins/vuetify.ts:
 *   import { createNeoVuetify } from "@neo/vuetify";
 *   import { createVueI18nAdapter } from "vuetify/locale/adapters/vue-i18n";
 *   import { useI18n } from "vue-i18n";
 *   import { i18n } from "./i18n";
 *   export default createNeoVuetify({ i18n, useI18n }, { colors: { ... } });
 */
import "vuetify/styles";
import { createVuetify } from "vuetify";
import { VuetifyDateAdapter } from "vuetify/date/adapters/vuetify";
import { createVueI18nAdapter } from "vuetify/locale/adapters/vue-i18n";

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
