/**
 * Static search index for the website.
 *
 * Each entry is resolved at search time using the active i18n locale,
 * so results automatically match the language the user is browsing in.
 *
 * requiresAuth: true  → visible in results but shows a lock and redirects to login.
 * Add future portal/app pages here as the platform grows.
 */

export interface SearchItem {
  titleKey: string
  descKey: string
  path: string
  hash?: string
  requiresAuth?: boolean
}

export const searchIndex: SearchItem[] = [
  // ── Public pages ──────────────────────────────────────────────────────────
  {
    titleKey: "website.nav.home",
    descKey:  "website.hero.subtitle",
    path: "/",
  },
  {
    titleKey: "website.solutions.heading",
    descKey:  "website.solutions.subtitle",
    path: "/",
    hash: "#solutions",
  },
  {
    titleKey: "website.solutions.therapy.title",
    descKey:  "website.solutions.therapy.desc",
    path: "/",
    hash: "#solutions",
  },
  {
    titleKey: "website.solutions.diagnostics.title",
    descKey:  "website.solutions.diagnostics.desc",
    path: "/",
    hash: "#solutions",
  },
  {
    titleKey: "website.nav.forDentists",
    descKey:  "website.forDentists.subtitle",
    path: "/",
    hash: "#for-dentists",
  },
  {
    titleKey: "website.nav.forPatients",
    descKey:  "website.forPatients.subtitle",
    path: "/",
    hash: "#for-patients",
  },
  {
    titleKey: "website.nav.contact",
    descKey:  "website.contact.subtitlePatient",
    path: "/contact",
  },
  {
    titleKey: "website.contact.tabProfessional",
    descKey:  "website.contact.subtitleProfessional",
    path: "/contact?type=professional",
  },
  {
    titleKey: "website.nav.about",
    descKey:  "website.about.subtitle",
    path: "/about",
  },

  // ── Auth-protected (future portal features) ───────────────────────────────
  {
    titleKey: "website.search.myTreatment",
    descKey:  "website.search.myTreatmentDesc",
    path: "/portal/treatment",
    requiresAuth: true,
  },
  {
    titleKey: "website.search.myAppointments",
    descKey:  "website.search.myAppointmentsDesc",
    path: "/portal/appointments",
    requiresAuth: true,
  },
  {
    titleKey: "website.search.dentistDashboard",
    descKey:  "website.search.dentistDashboardDesc",
    path: "/portal/dashboard",
    requiresAuth: true,
  },
];
