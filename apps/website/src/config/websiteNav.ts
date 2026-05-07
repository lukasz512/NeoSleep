/**
 * Website navigation config — header, footer, mobile bottom nav.
 * Components filter by showInHeader / showInFooter flags.
 * Replace static arrays with CMS/API fetch without touching any component.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FooterSectionId = "product" | "company" | "resources" | "connect";

export interface FooterSocial {
  id: string;
  href: string;
  label: string;
}

export interface FooterBrandConfig {
  logoUrl: string;
  name: string;
  taglineKey: string;
  socials: FooterSocial[];
}

export interface FooterSectionConfig {
  id: FooterSectionId;
  headingKey: string;
}

export interface WebsiteNavItem {
  labelKey: string;
  href?: string;
  to?: string;
  cta?: boolean;
  showInHeader?: boolean;
  showInFooter?: boolean;
  footerSection?: FooterSectionId;
}

// ── Footer brand ──────────────────────────────────────────────────────────────

export const footerBrandConfig: FooterBrandConfig = {
  logoUrl: "/brand/logos/logo/logo_dark.svg",
  name: "NeoSleep",
  taglineKey: "website.footer.tagline",
  socials: [
    { id: "instagram", href: "https://www.instagram.com/neosleepcare",    label: "Instagram" },
    { id: "linkedin",  href: "https://www.linkedin.com/company/neo-sleep", label: "LinkedIn"  },
    { id: "youtube",   href: "https://www.youtube.com/@neosleep",          label: "YouTube"   },
  ],
};

export const footerNavSections: FooterSectionId[] = ["company", "product", "resources"];

export const footerSections: FooterSectionConfig[] = [
  { id: "product",   headingKey: "website.footer.product"   },
  { id: "company",   headingKey: "website.footer.company"   },
  { id: "resources", headingKey: "website.footer.resources" },
  { id: "connect",   headingKey: "website.footer.connect"   },
];

// ── Nav items (header + footer) ───────────────────────────────────────────────

export const websiteNavItems: WebsiteNavItem[] = [
  // Header
  { labelKey: "website.nav.solutions",     href: "/#solutions",  showInHeader: true, showInFooter: true, footerSection: "product" },
  { labelKey: "website.nav.forDentists",   to: "/for-dentists",  showInHeader: true, showInFooter: true, footerSection: "product" },
  { labelKey: "website.nav.forPatients",   to: "/for-patients",  showInHeader: true, showInFooter: true, footerSection: "product" },
  { labelKey: "website.nav.findSpecialist",to: "/find-specialist",showInHeader: true },
  { labelKey: "website.nav.about",         to: "/about",          showInHeader: true },
  { labelKey: "website.nav.contact",       to: "/contact",        showInHeader: true },
  { labelKey: "website.header.cta",        to: "/evento", cta: true, showInHeader: false, showInFooter: false, footerSection: "product" },
  // Footer: Company
  { labelKey: "website.footer.company.about",   to: "/about",   showInFooter: true, footerSection: "company" },
  { labelKey: "website.footer.company.careers", to: "/careers", showInFooter: true, footerSection: "company" },
  { labelKey: "website.footer.company.press",   href: "#",      showInFooter: true, footerSection: "company" },
  { labelKey: "website.footer.company.contact", to: "/contact", showInFooter: true, footerSection: "company" },
  // Footer: Resources
  { labelKey: "website.footer.resources.blog",    href: "#",      showInFooter: true, footerSection: "resources" },
  { labelKey: "website.footer.resources.help",    to: "/help",    showInFooter: true, footerSection: "resources" },
  { labelKey: "website.footer.resources.research",href: "#",      showInFooter: true, footerSection: "resources" },
  { labelKey: "website.footer.resources.privacy", to: "/privacy", showInFooter: true, footerSection: "resources" },
  // Footer: Connect
  { labelKey: "website.footer.connect.twitter",   href: "#", showInFooter: true, footerSection: "connect" },
  { labelKey: "website.footer.connect.linkedin",  href: "#", showInFooter: true, footerSection: "connect" },
  { labelKey: "website.footer.connect.facebook",  href: "#", showInFooter: true, footerSection: "connect" },
  { labelKey: "website.footer.connect.instagram", href: "#", showInFooter: true, footerSection: "connect" },
];

export function getHeaderNavItems(): WebsiteNavItem[] {
  return websiteNavItems.filter((item) => item.showInHeader);
}

export function getFooterNavItemsBySection(): Map<FooterSectionId, WebsiteNavItem[]> {
  const bySection = new Map<FooterSectionId, WebsiteNavItem[]>();
  for (const section of footerSections) {
    const items = websiteNavItems.filter(
      (item) => item.showInFooter && item.footerSection === section.id
    );
    if (items.length) bySection.set(section.id, items);
  }
  return bySection;
}

// ── Mobile bottom nav ─────────────────────────────────────────────────────────

export const MOBILE_NAV_LINKS = [
  { id: "home",    to: "/",        labelKey: "website.nav.home"    },
  { id: "contact", to: "/contact", labelKey: "website.nav.contact" },
] as const;
