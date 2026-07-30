/** Static brand asset URLs, served from packages/brand/ at /brand (see vite.shared.ts).
 *  Single source of truth — apps import these instead of hardcoding paths. */

export const BRAND_LOGO_LIGHT_URL = "/brand/logos/logo/logo_light.svg";
export const BRAND_LOGO_DARK_URL = "/brand/logos/logo/logo_dark.svg";

export const BRAND_ICON_LIGHT_URL = "/brand/logos/icon/icon_light.svg";
export const BRAND_ICON_DARK_URL = "/brand/logos/icon/icon_dark.svg";

/** Generic "installable PWA" badge shown on the login card. */
export const BRAND_PWA_BADGE_URL = "/brand/logos/pwa/pwa-badge.png";

/** Faint medical photo layered behind the auth screen's animated gradient (see PublicLayout.vue). */
export const BRAND_AUTH_BACKGROUND_URL = "/brand/logos/auth/auth-bg.webp";
