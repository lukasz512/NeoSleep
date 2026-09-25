/**
 * Identity tint family per entity type (theme.scss --pwa-identity-<tone>,
 * NEO-57): patient teal, doctor blue, organization amber, everyone else
 * (users, leads, events) neutral. Shared by AppAvatar, IdentityTags and
 * EntityLink so an avatar and its tags always agree.
 */
export type IdentityTone = "patient" | "doctor" | "org" | "person";

export function identityTone(entityType: string): IdentityTone {
  if (entityType === "patient") return "patient";
  if (entityType === "hcp") return "doctor";
  if (entityType === "hco") return "org";
  return "person";
}
