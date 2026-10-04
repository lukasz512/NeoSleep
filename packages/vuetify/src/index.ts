/**
 * Shared Vuetify 4 factory for NeoSleep apps.
 *
 * Usage in plugins/vuetify.ts:
 *   import { createNeoVuetify } from "@vuetify";
 *   import { createVueI18nAdapter } from "vuetify/locale/adapters/vue-i18n";
 *   import { useI18n } from "vue-i18n";
 *   import { i18n } from "./i18n";
 *   export default createNeoVuetify({ i18n, useI18n }, { colors: { ... } });
 */
import "vuetify/styles";
import "./legacy-reset.css";
import "./tooltip.css";
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

/** Vuetify 3's display breakpoints (px), kept on Vuetify 4 — see createNeoVuetify. */
export const VUETIFY3_THRESHOLDS = { xs: 0, sm: 600, md: 960, lg: 1280, xl: 1920, xxl: 2560 } as const;

/**
 * Light-theme neutrals (NEO-236, "A · Graphite + deep teal"): white cards on
 * a cool graphite page, near-black ink. Mirrored by the light tokens in the PWA's
 * theme.scss (--pwa-bg, --pwa-border, --pwa-text…). The M3 roles (outline,
 * surface-container-*) aren't in Vuetify's default palette since this
 * project isn't on the `md3` blueprint.
 */
export const lightNeutrals = {
  background:               "#E9EDEC",
  surface:                  "#FFFFFF",
  "on-background":          "#0E1615",
  "on-surface":             "#0E1615",
  outline:                  "#66726F",
  "outline-variant":        "#C5CFCC",
  "surface-container-low":  "#F3F5F4",
  "surface-container":      "#EDF0EF",
  "surface-container-high": "#E6EAE9",
} as const;

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
    display: {
      // Vuetify 4 lowered md/lg/xl/xxl to 840/1145/1545/2138. Keep the v3
      // thresholds so useDisplay() flags (smAndUp, md="6" columns, …) flip at
      // the same widths as before; the matching Sass $grid-breakpoints for the
      // responsive utility classes live in apps/pwa/src/styles/vuetify-settings.scss.
      thresholds: VUETIFY3_THRESHOLDS,
      ...(options.mobileBreakpoint !== undefined ? { mobileBreakpoint: options.mobileBreakpoint } : {}),
    },
    // "mx" is the app's key for es-MX, not a BCP 47 tag Intl knows — without
    // this map the date picker's month and weekday names fall back to English.
    date: { adapter: VuetifyDateAdapter, locale: { en: "en-US", pl: "pl-PL", mx: "es-MX" } },
    locale: { adapter: createVueI18nAdapter(adapterInput) },
    defaults: {
      // Tooltips wait half a second (no flash while the pointer passes by)
      // and fade in softly instead of Vuetify's scale pop (tooltip.css).
      VTooltip: {
        openDelay: 500,
        transition: "neo-tooltip",
      },
      // The data-table footer's items-per-page VSelect exposes no props of
      // its own; nested defaults are the only way to tag its teleported
      // menu so app CSS can style it like the table (see pwa theme.scss).
      VDataTableFooter: {
        VSelect: {
          itemColor: "primary",
          menuProps: { contentClass: "neo-table-page-size-menu" },
        },
      },
    },
    theme: {
      defaultTheme: light,
      themes: {
        [light]: {
          dark: false,
          colors: {
            primary:            options.colors.lightPrimary,
            "primary-darken-1": options.colors.lightPrimaryDarken,
            ...lightNeutrals,
          },
          // Secondary text (Vuetify's medium emphasis) at 0.74 instead of
          // 0.6 reads ~8:1 on the cream card instead of ~4.7:1 (NEO-236).
          variables: {
            "high-emphasis-opacity":   0.92,
            "medium-emphasis-opacity": 0.74,
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
