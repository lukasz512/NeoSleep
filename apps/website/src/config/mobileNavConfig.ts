/**
 * Mobile bottom nav — white-label config.
 *
 * Views (MobileBottomNav.vue) and data are separate concerns.
 * To customise for a tenant: swap this file. The component shell stays untouched.
 *
 * Link items: defined here (to, labelKey).
 * Unique items (theme toggle, language): their own modules in components/.
 */

export const MOBILE_NAV_LINKS = [
  { id: 'home',    to: '/',        labelKey: 'website.nav.home' },
  { id: 'contact', to: '/contact', labelKey: 'website.nav.contact' },
] as const
