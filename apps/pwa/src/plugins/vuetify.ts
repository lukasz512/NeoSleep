/**
 * Vuetify 3 plugin for the app.
 * Theme names and brand colors are passed to the shared factory.
 */
import { createNeoVuetify } from "@vuetify";
import { useI18n } from "vue-i18n";
import { i18n } from "./i18n";
import { brandColors } from "@brand/colors";

export const lightTheme = "light";
export const darkTheme  = "dark";

export default createNeoVuetify({ i18n, useI18n }, {
  lightThemeName: lightTheme,
  darkThemeName:  darkTheme,
  colors: {
    lightPrimary:      brandColors.primary,
    lightPrimaryDarken:brandColors.primaryHover,
    darkPrimary:       brandColors.primaryOnDark,
    darkPrimaryDarken: brandColors.primaryOnDarkHover,
  },
});
