/**
 * NeoSleep brand color palette — single source of truth.
 * Used by all apps (website, rep-app, portal, ...).
 * Logos: brand/logos/. Colors: here.
 */

export const brandColors = {
  /** Primary teal – main accent, CTAs, logo top arc */
  primary: "#128F83",
  /** Hover / darker teal */
  primaryHover: "#10544E",
  /** Light teal / mint – backgrounds, subtle highlights */
  primaryLight: "#8ED6CE",
  /** Very dark teal – footer, dark sections */
  primaryDark: "#082A27",

  /** Primary for dark-mode surfaces (lighter teal, meets contrast) */
  primaryOnDark: "#17b5a5",
  /** Hover for dark-mode primary */
  primaryOnDarkHover: "#0f9284",

  /** Charcoal dark – header/footer on light, logo bottom arc */
  charcoalDark: "#474747",
  /** Charcoal medium – body text on white */
  charcoalMedium: "#555555",

  white: "#FFFFFF",
} as const;

export type BrandColorKey = keyof typeof brandColors;
