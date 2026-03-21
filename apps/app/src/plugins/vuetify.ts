/**
 * Vuetify 3 plugin for rep-app.
 * Theme names and brand colors are passed to the shared factory.
 */
import { createNeoVuetify } from "@vuetify";
import { useI18n } from "vue-i18n";
import { i18n } from "./i18n";
import { brandColors } from "@brand/colors";

export const repLightTheme = "repLight";
export const repDarkTheme  = "repDark";

export default createNeoVuetify({ i18n, useI18n }, {
  lightThemeName: repLightTheme,
  darkThemeName:  repDarkTheme,
  colors: {
    lightPrimary:      brandColors.primary,
    lightPrimaryDarken:brandColors.primaryHover,
    darkPrimary:       brandColors.primaryOnDark,
    darkPrimaryDarken: brandColors.primaryOnDarkHover,
  },
});
