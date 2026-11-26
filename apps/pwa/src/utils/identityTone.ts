/**
 * Identity color family per entity type (theme.scss $pwa-avatar-families,
 * NEO-155 "quiet + accent"): patient = brand teal, doctor = cool graphite,
 * organization = warm stone, lead = teal outline only, everyone else
 * (users, events) = neutral desk grey. Shared by AppAvatar and anything that
 * has to agree with an avatar's color.
 */
export type IdentityTone = "patient" | "doctor" | "org" | "lead" | "person";

export function identityTone(entityType: string): IdentityTone {
  if (entityType === "patient") return "patient";
  if (entityType === "hcp") return "doctor";
  if (entityType === "hco") return "org";
  if (entityType === "lead") return "lead";
  return "person";
}
