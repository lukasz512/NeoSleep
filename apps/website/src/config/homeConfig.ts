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

export const homeStats: StatConfig[] = [
  { target: 25,  suffix: "M+", labelKey: "website.stats.americansLabel"    },
  { target: 80,  suffix: "%",  labelKey: "website.stats.undiagnosedLabel"  },
  { target: 95,  suffix: "%",  labelKey: "website.stats.satisfactionLabel" },
  { target: 500, suffix: "+",  labelKey: "website.stats.dentistsLabel"     },
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

export const dentistFeatures: FeatureItem[] = [
  { id: "expand",   icon: IconPeople,     titleKey: "website.forDentists.expand.title",   descKey: "website.forDentists.expand.desc"   },
  { id: "revenue",  icon: IconChart,      titleKey: "website.forDentists.revenue.title",  descKey: "website.forDentists.revenue.desc",  animId: "chart" },
  { id: "training", icon: IconGraduation, titleKey: "website.forDentists.training.title", descKey: "website.forDentists.training.desc" },
  { id: "outcomes", icon: IconHeart,      titleKey: "website.forDentists.outcomes.title", descKey: "website.forDentists.outcomes.desc" },
];

export const patientFeatures: FeatureItem[] = [
  { id: "restful",     icon: IconMoon,   titleKey: "website.forPatients.restful.title",     descKey: "website.forPatients.restful.desc"     },
  { id: "nonInvasive", icon: IconShield, titleKey: "website.forPatients.nonInvasive.title", descKey: "website.forPatients.nonInvasive.desc" },
  { id: "quick",       icon: IconClock,  titleKey: "website.forPatients.quick.title",       descKey: "website.forPatients.quick.desc",       clockPatients: true },
  { id: "health",      icon: IconSmile,  titleKey: "website.forPatients.health.title",      descKey: "website.forPatients.health.desc"      },
];

export const heroConfig = {
  imageSrc: "/images/hero.jpeg",
  ctaPrimary:   { href: "#for-patients", labelKey: "website.hero.ctaFindDentist" },
  ctaSecondary: { href: "#solutions",    labelKey: "website.hero.ctaLearnMore"   },
};

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

export const splitSections: SplitSectionConfig[] = [
  {
    id: "for-dentists",
    eyebrowKey: "website.forDentists.title",
    headingKey: "website.forDentists.heading",
    subtitleKey: "website.forDentists.subtitle",
    ctaKey: "website.forDentists.cta",
    ctaTo: { path: "/contact", query: { type: "professional" } },
    imageSrc: "/images/for-dentists.png",
    imagePosition: "50% 50%",
    imageLeft: true,
    features: dentistFeatures,
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

export interface CtaButton {
  labelKey: string;
  to: RouteLocationRaw;
  variant: "white-outline" | "white-border";
  arrow?: boolean;
}

export const ctaBannerConfig = {
  headingKey: "website.cta.heading",
  subtitleKey: "website.cta.subtitle",
  buttons: [
    { labelKey: "website.cta.forPatient", to: { path: "/contact", query: { type: "patient"      } }, variant: "white-outline" as const, arrow: true },
    { labelKey: "website.cta.forDentist", to: { path: "/contact", query: { type: "professional" } }, variant: "white-border"  as const },
  ] as CtaButton[],
};
