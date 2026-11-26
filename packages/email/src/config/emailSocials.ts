export interface SocialLink {
  id: "instagram" | "linkedin" | "youtube";
  /** Filename under packages/email/assets/email/ — attached inline and referenced via cid. */
  file: string;
  href: string;
  label: string;
}

/**
 * Social links shown in the email footer — single source of truth.
 * Keyed by region (region is an attribute on users/HCPs, not a tenant — see CLAUDE.md), so a
 * recipient's own region can get its own handles. Add a region key below to override DEFAULT_SOCIALS;
 * unlisted regions (and, later, white-label tenants without their own override) fall back to it.
 */
const DEFAULT_SOCIALS: SocialLink[] = [
  { id: "instagram", file: "social-instagram.png", href: "https://www.instagram.com/neosleep_mx", label: "Instagram" },
  { id: "linkedin", file: "social-linkedin.png", href: "https://www.linkedin.com/company/neo-sleep", label: "LinkedIn" },
  { id: "youtube", file: "social-youtube.png", href: "https://www.youtube.com/@NeoSleepGlobal", label: "YouTube" },
];

const SOCIALS_BY_REGION: Record<string, SocialLink[]> = {
  // PL: [ ... ], — add a region-specific override here once we have different links for it
};

export function getSocialsForRegion(region?: string | null): SocialLink[] {
  if (region && SOCIALS_BY_REGION[region]) return SOCIALS_BY_REGION[region];
  return DEFAULT_SOCIALS;
}
