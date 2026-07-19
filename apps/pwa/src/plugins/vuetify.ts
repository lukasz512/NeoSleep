/**
 * Vuetify 3 plugin for the app.
 * Theme names and brand colors are passed to the shared factory.
 */
import { createNeoVuetify } from "@vuetify";
import { useI18n } from "vue-i18n";
import { i18n } from "./i18n";
import { brandColors } from "@brand/colors";
import { MOBILE_BREAKPOINT } from "../constants";

export const lightTheme = "light";
export const darkTheme  = "dark";

export default createNeoVuetify({ i18n, useI18n }, {
  lightThemeName: lightTheme,
  darkThemeName:  darkTheme,
  // Keeps Vuetify's own useDisplay().mobile (used by AppShell for the
  // hamburger/bottom-nav/permanent-drawer split) in lockstep with the app's
  // own MOBILE_BREAKPOINT (used by useLayoutState for the rest of the
  // layout) — same threshold, no dead zone between the two.
  mobileBreakpoint: MOBILE_BREAKPOINT,
  colors: {
    lightPrimary:      brandColors.primary,
    lightPrimaryDarken:brandColors.primaryHover,
    darkPrimary:       brandColors.primaryOnDark,
    darkPrimaryDarken: brandColors.primaryOnDarkHover,
  },
});
