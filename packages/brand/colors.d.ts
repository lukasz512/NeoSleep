/**
 * NeoSleep brand color palette — single source of truth.
 * Used by all apps (website, rep-app, portal, ...).
 * Logos: brand/logos/. Colors: here.
 */
export declare const brandColors: {
    /** Primary teal – main accent, CTAs, logo top arc */
    readonly primary: "#128F83";
    /** Hover / darker teal */
    readonly primaryHover: "#10544E";
    /** Light teal / mint – backgrounds, subtle highlights */
    readonly primaryLight: "#8ED6CE";
    /** Very dark teal – footer, dark sections */
    readonly primaryDark: "#082A27";
    /** Primary for dark-mode surfaces (lighter teal, meets contrast) */
    readonly primaryOnDark: "#17b5a5";
    /** Hover for dark-mode primary */
    readonly primaryOnDarkHover: "#0f9284";
    /** Charcoal dark – header/footer on light, logo bottom arc */
    readonly charcoalDark: "#474747";
    /** Charcoal medium – body text on white */
    readonly charcoalMedium: "#555555";
    readonly white: "#FFFFFF";
};
export type BrandColorKey = keyof typeof brandColors;
