/**
 * Vuetify 3 plugin for rep-app.
 * Primary colors come from brand/colors.ts (single source of truth shared with all apps).
 */
import "vuetify/styles";
import { createVuetify } from "vuetify";
import { brandColors } from "@brand/colors";

export const repLightTheme = "repLight";
export const repDarkTheme = "repDark";

export default createVuetify({
  theme: {
    defaultTheme: repLightTheme,
    themes: {
      [repLightTheme]: {
        dark: false,
        colors: {
          primary: brandColors.primary,
          "primary-darken-1": brandColors.primaryHover,
        },
      },
      [repDarkTheme]: {
        dark: true,
        colors: {
          primary: brandColors.primaryOnDark,
          "primary-darken-1": brandColors.primaryOnDarkHover,
        },
      },
    },
  },
});
