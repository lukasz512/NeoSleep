/**
 * Practitioner specialty → icon, mirroring hcoLabels.ts's hcoTypeIcon for
 * organizations. Specialty codes come from the tenant-configurable `specialty`
 * lookup (apps/api/migrations/002_seed.sql) — icons cover the seeded defaults;
 * any tenant-added or unseeded code falls back to the generic HCP icon.
 */
import type AppIcon from "../components/AppIcon.vue";

type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

export function practitionerSpecialtyIcon(specialty?: string): AppIconName {
  switch (specialty) {
    case "dentist":       return "specialty-dentist";
    case "ent":            return "specialty-ent";
    case "gp":              return "specialty-gp";
    case "neurologist":    return "specialty-neurologist";
    case "psychiatrist":   return "specialty-psychiatrist";
    case "cardiologist":   return "specialty-cardiologist";
    case "pulmonologist":  return "specialty-pulmonologist";
    default:                return "nav-hcp";
  }
}
