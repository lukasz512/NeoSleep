/**
 * "More projects" (Łukasz, 2026-09-29, V1: all three video sets): events AJM produced beyond the four
 * proposal cases, each shown as a strip of stills cut from its video (scripts/encode-extra.sh).
 * Titles are proper nouns (same in both locales); the kind and place are copy in locales/*.json.
 */
export interface MoreProject {
  id: "minions" | "wedding";
  title: string;
  year?: number;
  /** base names under media/more/, each with -640 and -1280 files */
  photos: string[];
}

export const MORE_PROJECTS: MoreProject[] = [
  { id: "minions", title: "Minions × Vogue Brasil", year: 2025, photos: ["minions1", "minions2", "minions3", "minions4"] },
  { id: "wedding", title: "Indian Wedding", photos: ["wedding1", "wedding2", "wedding3", "wedding4"] },
];
