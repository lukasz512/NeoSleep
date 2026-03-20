/**
 * Vuetify 3 plugin for rep-app.
 *
 * Date adapter: built-in VuetifyDateAdapter (native JS Date, ISO 8601).
 * Locale adapter: Vue i18n — keeps Vuetify component labels in sync with app locale.
 *
 * Primary colors come from brand/colors.ts (single source of truth shared with all apps).
 */
import "vuetify/styles";
import { createVuetify } from "vuetify";
import { VuetifyDateAdapter } from "vuetify/date/adapters/vuetify";
import { createVueI18nAdapter } from "vuetify/locale/adapters/vue-i18n";
import { useI18n } from "vue-i18n";
import { i18n } from "./i18n";
import { brandColors } from "@brand/colors";

export const repLightTheme = "repLight";
export const repDarkTheme  = "repDark";

export default createVuetify({
  date: {
    adapter: VuetifyDateAdapter,
  },

  locale: {
    adapter: createVueI18nAdapter({ i18n, useI18n }),
  },

  theme: {
    defaultTheme: repLightTheme,
    themes: {
      [repLightTheme]: {
        dark: false,
        colors: {
          primary:            brandColors.primary,
          "primary-darken-1": brandColors.primaryHover,
        },
      },
      [repDarkTheme]: {
        dark: true,
        colors: {
          primary:            brandColors.primaryOnDark,
          "primary-darken-1": brandColors.primaryOnDarkHover,
        },
      },
    },
  },
});
