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
  /**
   * Overrides Vuetify's own mobile/desktop threshold (default 'lg' = 1280px)
   * so `useDisplay().mobile` agrees with the app's own mobile breakpoint —
   * otherwise app-level chrome (hamburger, bottom nav) and Vuetify-driven
   * chrome (permanent nav drawer) can flip at different widths, leaving a
   * dead zone with neither a visible left menu nor consistent app state.
   */
  mobileBreakpoint?: number;
}

export function createNeoVuetify(
  adapterInput: Parameters<typeof createVueI18nAdapter>[0],
  options: NeoVuetifyOptions,
) {
  const light = options.lightThemeName ?? "neoLight";
  const dark  = options.darkThemeName  ?? "neoDark";

  return createVuetify({
    display: options.mobileBreakpoint !== undefined
      ? { mobileBreakpoint: options.mobileBreakpoint }
      : undefined,
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
            // Material 3 neutral roles, not yet part of Vuetify's own default
            // palette (this project isn't on the `md3` blueprint). Values
            // pick up the same grays already in use as --pwa-border /
            // --pwa-bg-secondary (theme.scss) so existing borders/surfaces
            // don't shift — only their semantic role (and CSS var name)
            // becomes reusable M3 vocabulary for new components.
            outline:                 "#79747E",
            "outline-variant":       "#e0e0e0",
            "surface-container-low":  "#f7f7f7",
            "surface-container":      "#f2f2f2",
            "surface-container-high": "#ececec",
          },
        },
        [dark]: {
          dark: true,
          colors: {
            primary:            options.colors.darkPrimary,
            "primary-darken-1": options.colors.darkPrimaryDarken,
            outline:                 "#948F94",
            "outline-variant":       "#333333",
            "surface-container-low":  "#1a1a1a",
            "surface-container":      "#1e1e1e",
            "surface-container-high": "#262626",
          },
        },
      },
    },
  });
}
