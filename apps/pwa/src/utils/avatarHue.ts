/**
 * Name-seeded avatar color (NEO-155): every person gets one of
 * AVATAR_HUE_COUNT tints (theme.scss --pwa-avatar-<n>-bg/-fg), picked by a
 * stable hash of their name — so a mixed list reads varied, and the same
 * person keeps the same color on every screen and every device.
 */
export const AVATAR_HUE_COUNT = 10;

export function avatarHueIndex(seed: string | null | undefined): number {
  const text = (seed ?? "").trim().toLowerCase();
  let hash = 7;
  for (const ch of text) hash = (Math.imul(hash, 31) + (ch.codePointAt(0) ?? 0)) >>> 0;
  return hash % AVATAR_HUE_COUNT;
}
