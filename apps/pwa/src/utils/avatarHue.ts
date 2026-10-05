import type { IdentityTone } from "./identityTone";

/**
 * Avatar tint within its color family (NEO-155, "quiet + accent"): every
 * family in theme.scss $pwa-avatar-families has a few tints, and a person
 * gets one by a stable hash of their name — so the same person keeps the
 * same tint on every screen and device, while a list still varies.
 * Keep AVATAR_FAMILY_SIZES equal to the theme.scss list lengths.
 */
export const AVATAR_FAMILY_SIZES: Record<IdentityTone, number> = {
  patient: 8,
  doctor: 3,
  org: 5,
  lead: 2,
  person: 3,
};

/** Organizations are tinted by what they are, not by name — same order as the org tints in theme.scss. */
const ORG_TYPE_TINTS = ["clinic", "hospital", "pharmacy", "practice", "other"];

function hashIndex(seed: string | null | undefined, size: number): number {
  const text = (seed ?? "").trim().toLowerCase();
  let hash = 7;
  for (const ch of text) hash = (Math.imul(hash, 31) + (ch.codePointAt(0) ?? 0)) >>> 0;
  return hash % size;
}

export function avatarTintIndex(tone: IdentityTone, seed: string | null | undefined): number {
  if (tone === "org") {
    const byType = ORG_TYPE_TINTS.indexOf((seed ?? "").trim().toLowerCase());
    return byType >= 0 ? byType : ORG_TYPE_TINTS.indexOf("clinic");
  }
  return hashIndex(seed, AVATAR_FAMILY_SIZES[tone]);
}
