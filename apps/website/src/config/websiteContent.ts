/**
 * Website static content config — home page, careers, help, patients, legal, search.
 * All user-facing strings are i18n keys; components never hardcode copy.
 * Replace any section with a CMS/API fetch without touching components.
 */

import type { Component } from "vue";
import type { RouteLocationRaw } from "vue-router";
import {
  IconHeartbeat,
  IconClock,
  IconPeople,
  IconChart,
  IconGraduation,
  IconHeart,
  IconMoon,
  IconShield,
  IconSmile,
} from "../components/icons";

// ─────────────────────────────────────────────────────────────────────────────
// HOME
// ─────────────────────────────────────────────────────────────────────────────

export interface StatConfig {
  target: number;
  suffix: string;
  labelKey: string;
}

export interface SolutionCard {
  id: string;
  icon: Component;
  titleKey: string;
  descKey: string;
  bulletKeys: [string, string, string];
  animId?: "heartbeat";
}

export interface FeatureItem {
  id: string;
  icon: Component;
  titleKey: string;
  descKey: string;
  animId?: "chart";
  clockPatients?: true;
}

export interface SplitSectionConfig {
  id: string;
  eyebrowKey: string;
  headingKey: string;
  subtitleKey: string;
  ctaKey: string;
  ctaTo: RouteLocationRaw;
  imageSrc: string;
  imagePosition?: string;
  imageLeft?: boolean;
  features: FeatureItem[];
}

export interface CtaButton {
  labelKey: string;
  to: RouteLocationRaw;
  variant: "white-outline" | "white-border";
  arrow?: boolean;
}

export const homeStats: StatConfig[] = [
  { target: 25,  suffix: "M+", labelKey: "website.stats.americansLabel"    },
  { target: 80,  suffix: "%",  labelKey: "website.stats.undiagnosedLabel"  },
  { target: 95,  suffix: "%",  labelKey: "website.stats.satisfactionLabel" },
  { target: 500, suffix: "+",  labelKey: "website.stats.specialistsLabel"     },
];

export const solutionCards: SolutionCard[] = [
  {
    id: "therapy",
    icon: IconHeartbeat,
    titleKey: "website.solutions.therapy.title",
    descKey:  "website.solutions.therapy.desc",
    bulletKeys: [
      "website.solutions.therapy.bullet1",
      "website.solutions.therapy.bullet2",
      "website.solutions.therapy.bullet3",
    ],
    animId: "heartbeat",
  },
  {
    id: "diagnostics",
    icon: IconClock,
    titleKey: "website.solutions.diagnostics.title",
    descKey:  "website.solutions.diagnostics.desc",
    bulletKeys: [
      "website.solutions.diagnostics.bullet1",
      "website.solutions.diagnostics.bullet2",
      "website.solutions.diagnostics.bullet3",
    ],
  },
];

export const professionalFeatures: FeatureItem[] = [
  { id: "expand",   icon: IconPeople,     titleKey: "website.forProfessionals.expand.title",   descKey: "website.forProfessionals.expand.desc"   },
  { id: "revenue",  icon: IconChart,      titleKey: "website.forProfessionals.revenue.title",  descKey: "website.forProfessionals.revenue.desc",  animId: "chart" },
  { id: "training", icon: IconGraduation, titleKey: "website.forProfessionals.training.title", descKey: "website.forProfessionals.training.desc" },
  { id: "outcomes", icon: IconHeart,      titleKey: "website.forProfessionals.outcomes.title", descKey: "website.forProfessionals.outcomes.desc" },
];

export const patientFeatures: FeatureItem[] = [
  { id: "restful",     icon: IconMoon,   titleKey: "website.forPatients.restful.title",     descKey: "website.forPatients.restful.desc"     },
  { id: "nonInvasive", icon: IconShield, titleKey: "website.forPatients.nonInvasive.title", descKey: "website.forPatients.nonInvasive.desc" },
  { id: "quick",       icon: IconClock,  titleKey: "website.forPatients.quick.title",       descKey: "website.forPatients.quick.desc",       clockPatients: true },
  { id: "health",      icon: IconSmile,  titleKey: "website.forPatients.health.title",      descKey: "website.forPatients.health.desc"      },
];

export const heroConfig = {
  imageSrc: "/images/hero.jpeg",
  ctaPrimary:   { href: "#for-patients", labelKey: "website.hero.ctaFindSpecialist" },
  ctaSecondary: { href: "#solutions",    labelKey: "website.hero.ctaLearnMore"   },
};

export const splitSections: SplitSectionConfig[] = [
  {
    id: "for-professionals",
    eyebrowKey: "website.forProfessionals.title",
    headingKey: "website.forProfessionals.heading",
    subtitleKey: "website.forProfessionals.subtitle",
    ctaKey: "website.forProfessionals.cta",
    ctaTo: { path: "/contact", query: { type: "professional" } },
    imageSrc: "/images/for-professionals.png",
    imagePosition: "50% 50%",
    imageLeft: true,
    features: professionalFeatures,
  },
  {
    id: "for-patients",
    eyebrowKey: "website.forPatients.title",
    headingKey: "website.forPatients.heading",
    subtitleKey: "website.forPatients.subtitle",
    ctaKey: "website.forPatients.cta",
    ctaTo: { path: "/contact", query: { type: "patient" } },
    imageSrc: "/images/for-patients.jpg",
    features: patientFeatures,
  },
];

export const solutionsCtaTo: RouteLocationRaw = { path: "/contact", query: { type: "patient" } };

export const ctaBannerConfig = {
  headingKey: "website.cta.heading",
  subtitleKey: "website.cta.subtitle",
  buttons: [
    { labelKey: "website.cta.forPatient", to: { path: "/contact", query: { type: "patient"      } }, variant: "white-outline" as const, arrow: true },
    { labelKey: "website.cta.forProfessional", to: { path: "/contact", query: { type: "professional" } }, variant: "white-border"  as const },
  ] as CtaButton[],
};

// ─────────────────────────────────────────────────────────────────────────────
// CAREERS
// ─────────────────────────────────────────────────────────────────────────────

export type JobType       = "b2b" | "full-time" | "part-time" | "contract";
export type JobDepartment = "clinical" | "tech" | "operations" | "marketing";

export interface JobListing {
  id:              string;
  titleKey:        string;
  departmentKey:   string;
  department:      JobDepartment;
  descKey:         string;
  locationCity:    string;
  locationCountry: string;
  type:            JobType;
  remote:          boolean;
  linkedInUrl?:    string;
  postedAt:        string;
  tags:            string[];
  featured?:       boolean;
}

export const jobListings: JobListing[] = [
  {
    id:              "specialist-warsaw-01",
    titleKey:        "careers.jobs.specialistWarsaw.title",
    departmentKey:   "careers.dept.clinical",
    department:      "clinical",
    descKey:         "careers.jobs.specialistWarsaw.desc",
    locationCity:    "Warsaw",
    locationCountry: "Poland",
    type:            "b2b",
    remote:          false,
    postedAt:        "2026-03-01",
    tags:            ["sleep-medicine", "oral-appliance", "orthodontics"],
    featured:        true,
  },
  {
    id:              "odontologist-krakow-01",
    titleKey:        "careers.jobs.odontologistKrakow.title",
    departmentKey:   "careers.dept.clinical",
    department:      "clinical",
    descKey:         "careers.jobs.odontologistKrakow.desc",
    locationCity:    "Kraków",
    locationCountry: "Poland",
    type:            "b2b",
    remote:          false,
    postedAt:        "2026-03-05",
    tags:            ["sleep-medicine", "dental", "patient-care"],
    featured:        false,
  },
  {
    id:              "specialist-madrid-01",
    titleKey:        "careers.jobs.specialistMadrid.title",
    departmentKey:   "careers.dept.clinical",
    department:      "clinical",
    descKey:         "careers.jobs.specialistMadrid.desc",
    locationCity:    "Mexico City",
    locationCountry: "Mexico",
    type:            "b2b",
    remote:          false,
    postedAt:        "2026-03-10",
    tags:            ["sleep-medicine", "ortodóncia", "odontología"],
    featured:        false,
  },
];

export const jobCountries  = [...new Set(jobListings.map((j) => j.locationCountry))];
export const jobCities     = [...new Set(jobListings.map((j) => j.locationCity))];
export const jobDepartments= [...new Set(jobListings.map((j) => j.department))] as JobDepartment[];

// ─────────────────────────────────────────────────────────────────────────────
// HELP / FAQ
// ─────────────────────────────────────────────────────────────────────────────

export interface HelpCategory {
  id: "condition" | "treatment" | "professionals" | "privacy";
  titleKey: string;
  descKey: string;
}

export interface FaqItem {
  id: string;
  category: HelpCategory["id"];
  questionKey: string;
  answerKey: string;
}

export const helpCategories: HelpCategory[] = [
  { id: "condition", titleKey: "website.help.cat.condition.title", descKey: "website.help.cat.condition.desc" },
  { id: "treatment", titleKey: "website.help.cat.treatment.title", descKey: "website.help.cat.treatment.desc" },
  { id: "professionals",  titleKey: "website.help.cat.professionals.title",  descKey: "website.help.cat.professionals.desc"  },
  { id: "privacy",   titleKey: "website.help.cat.privacy.title",   descKey: "website.help.cat.privacy.desc"   },
];

export const helpFaqs: FaqItem[] = [
  { id: "q1", category: "condition", questionKey: "website.help.faq.q1.q", answerKey: "website.help.faq.q1.a" },
  { id: "q2", category: "condition", questionKey: "website.help.faq.q2.q", answerKey: "website.help.faq.q2.a" },
  { id: "q3", category: "treatment", questionKey: "website.help.faq.q3.q", answerKey: "website.help.faq.q3.a" },
  { id: "q4", category: "treatment", questionKey: "website.help.faq.q4.q", answerKey: "website.help.faq.q4.a" },
  { id: "q5", category: "professionals",  questionKey: "website.help.faq.q5.q", answerKey: "website.help.faq.q5.a" },
  { id: "q6", category: "professionals",  questionKey: "website.help.faq.q6.q", answerKey: "website.help.faq.q6.a" },
  { id: "q7", category: "privacy",   questionKey: "website.help.faq.q7.q", answerKey: "website.help.faq.q7.a" },
  { id: "q8", category: "privacy",   questionKey: "website.help.faq.q8.q", answerKey: "website.help.faq.q8.a" },
];

// ─────────────────────────────────────────────────────────────────────────────
// PATIENTS — testimonials
// ─────────────────────────────────────────────────────────────────────────────

export interface Testimonial {
  id:        string;
  quoteKey:  string;
  authorKey: string;
  roleKey:   string;
  rating:    number;
  initials:  string;
}

export const patientTestimonials: Testimonial[] = [
  { id: "t1", quoteKey: "website.patientsPage.testimonials.1.quote", authorKey: "website.patientsPage.testimonials.1.author", roleKey: "website.patientsPage.testimonials.1.role", rating: 5, initials: "MK" },
  { id: "t2", quoteKey: "website.patientsPage.testimonials.2.quote", authorKey: "website.patientsPage.testimonials.2.author", roleKey: "website.patientsPage.testimonials.2.role", rating: 5, initials: "PT" },
  { id: "t3", quoteKey: "website.patientsPage.testimonials.3.quote", authorKey: "website.patientsPage.testimonials.3.author", roleKey: "website.patientsPage.testimonials.3.role", rating: 5, initials: "AW" },
];

// ─────────────────────────────────────────────────────────────────────────────
// LEGAL
// ─────────────────────────────────────────────────────────────────────────────

export const legalConfig = {
  companyName:  "NeoSleep",
  privacyEmail: "info@neosleepcare.com",
  address:      "ul. Przykładowa 1, 00-001 Warszawa, Polska",
  lastUpdated:  "2026-01-01",
};

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH INDEX
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchItem {
  titleKey: string;
  descKey:  string;
  path:     string;
  hash?:    string;
  requiresAuth?: boolean;
}

export const searchIndex: SearchItem[] = [
  { titleKey: "website.nav.home",                   descKey: "website.hero.subtitle",                    path: "/"                      },
  { titleKey: "website.solutions.heading",           descKey: "website.solutions.subtitle",               path: "/",    hash: "#solutions" },
  { titleKey: "website.solutions.therapy.title",    descKey: "website.solutions.therapy.desc",           path: "/",    hash: "#solutions" },
  { titleKey: "website.solutions.diagnostics.title",descKey: "website.solutions.diagnostics.desc",       path: "/",    hash: "#solutions" },
  { titleKey: "website.nav.forProfessionals",             descKey: "website.forProfessionals.subtitle",             path: "/for-professionals"           },
  { titleKey: "website.nav.forPatients",             descKey: "website.forPatients.subtitle",             path: "/for-patients"           },
  { titleKey: "website.nav.findSpecialist",          descKey: "website.findSpecialist.heroSub",           path: "/find-specialist"        },
  { titleKey: "website.nav.contact",                 descKey: "website.contact.subtitlePatient",          path: "/contact"                },
  { titleKey: "website.contact.tabProfessional",     descKey: "website.contact.subtitleProfessional",     path: "/contact?type=professional" },
  { titleKey: "website.nav.about",                   descKey: "website.about.subtitle",                   path: "/about"                  },
  { titleKey: "website.footer.company.careers",      descKey: "careers.hero.subtitle",                    path: "/careers"                },
  // Auth-protected (future portal)
  { titleKey: "website.search.myTreatment",          descKey: "website.search.myTreatmentDesc",           path: "/portal/treatment",    requiresAuth: true },
  { titleKey: "website.search.myAppointments",       descKey: "website.search.myAppointmentsDesc",        path: "/portal/appointments", requiresAuth: true },
  { titleKey: "website.search.specialistDashboard",     descKey: "website.search.specialistDashboardDesc",      path: "/portal/dashboard",    requiresAuth: true },
];
