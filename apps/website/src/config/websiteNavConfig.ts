/**
 * Jedna konfiguracja menu dla header i footer.
 * Flagi showInHeader / showInFooter (i footerSection) pozwalają później podmienić
 * źródło na CMS (API) bez zmiany komponentów.
 */

export type FooterSectionId = "product" | "company" | "resources" | "connect";

export interface WebsiteNavItem {
  /** Klucz i18n dla etykiety */
  labelKey: string;
  /** Link hash/zewnętrzny (użyte gdy brak `to`) */
  href?: string;
  /** Ścieżka routera (Vue Router) */
  to?: string;
  /** W headerze: przycisk CTA (inny styl) */
  cta?: boolean;
  /** Pokazywać w menu header (desktop + mobile) */
  showInHeader?: boolean;
  /** Pokazywać w stopce */
  showInFooter?: boolean;
  /** W stopce: id sekcji (kolumny) */
  footerSection?: FooterSectionId;
}

export interface FooterSectionConfig {
  id: FooterSectionId;
  headingKey: string;
}

/** Kolejność sekcji stopki i nagłówki (i18n). */
export const footerSections: FooterSectionConfig[] = [
  { id: "product", headingKey: "website.footer.product" },
  { id: "company", headingKey: "website.footer.company" },
  { id: "resources", headingKey: "website.footer.resources" },
  { id: "connect", headingKey: "website.footer.connect" },
];

/**
 * Wszystkie pozycje menu. Jedna lista – header i footer filtrują po flagach.
 * Kolejność wpisów z showInHeader określa kolejność w headerze.
 * Później można zastąpić przez fetch z CMS.
 */
export const websiteNavItems: WebsiteNavItem[] = [
  // Header (kolejność = kolejność w menu)
  { labelKey: "website.nav.solutions", href: "/#solutions", showInHeader: true, showInFooter: true, footerSection: "product" },
  { labelKey: "website.nav.forDentists", href: "/#for-dentists", showInHeader: true, showInFooter: true, footerSection: "product" },
  { labelKey: "website.nav.forPatients", href: "/#for-patients", showInHeader: true, showInFooter: true, footerSection: "product" },
  { labelKey: "website.nav.about", to: "/about", showInHeader: true, showInFooter: true, footerSection: "company" },
  { labelKey: "website.nav.contact", to: "/contact", showInHeader: true, showInFooter: true, footerSection: "company" },
  { labelKey: "website.header.cta", href: "/#cta", cta: true, showInHeader: true, showInFooter: true, footerSection: "product" },
  // Tylko stopka: Product
  { labelKey: "website.footer.product.pricing", href: "/#cta", showInFooter: true, footerSection: "product" },
  // Tylko stopka: Company
  { labelKey: "website.footer.company.about", to: "/about", showInFooter: true, footerSection: "company" },
  { labelKey: "website.footer.company.careers", href: "#", showInFooter: true, footerSection: "company" },
  { labelKey: "website.footer.company.press", href: "#", showInFooter: true, footerSection: "company" },
  { labelKey: "website.footer.company.contact", to: "/contact", showInFooter: true, footerSection: "company" },
  // Tylko stopka: Resources
  { labelKey: "website.footer.resources.blog", href: "#", showInFooter: true, footerSection: "resources" },
  { labelKey: "website.footer.resources.help", href: "#", showInFooter: true, footerSection: "resources" },
  { labelKey: "website.footer.resources.research", href: "#", showInFooter: true, footerSection: "resources" },
  { labelKey: "website.footer.resources.privacy", href: "#", showInFooter: true, footerSection: "resources" },
  // Tylko stopka: Connect
  { labelKey: "website.footer.connect.twitter", href: "#", showInFooter: true, footerSection: "connect" },
  { labelKey: "website.footer.connect.linkedin", href: "#", showInFooter: true, footerSection: "connect" },
  { labelKey: "website.footer.connect.facebook", href: "#", showInFooter: true, footerSection: "connect" },
  { labelKey: "website.footer.connect.instagram", href: "#", showInFooter: true, footerSection: "connect" },
];

/** Pozycje tylko do header (kolejność ma znaczenie). */
export function getHeaderNavItems(): WebsiteNavItem[] {
  return websiteNavItems.filter((item) => item.showInHeader);
}

/** Pozycje stopki zgrupowane po sekcji (kolejność z footerSections). */
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
