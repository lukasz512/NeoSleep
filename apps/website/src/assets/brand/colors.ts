/**
 * NeoSleep brand color palette.
 * Use these in theme and components; CSS variables are defined in website-theme.scss.
 */

export const brandColors = {
  /** Primary teal – main accent, CTAs, logo top arc */
  primary: "#128F83",
  /** Hover state for primary buttons */
  primaryHover: "#10544E",
  /** Light teal / mint – backgrounds, subtle highlights */
  lightTeal: "#8ED6CE",
  /** Darker teal – hover, darker accents */
  darkerTeal: "#10544E",
  /** Very dark teal – footer, dark sections */
  veryDarkTeal: "#082A27",
  /** Charcoal dark – header/footer on light, logo bottom arc on light bg */
  charcoalDark: "#474747",
  /** Charcoal medium – body text on white */
  charcoalMedium: "#555555",
  white: "#FFFFFF",
} as const;

export type BrandColorKey = keyof typeof brandColors;
