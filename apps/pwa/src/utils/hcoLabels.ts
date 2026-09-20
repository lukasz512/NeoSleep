/**
 * Single source for organization type/status → label/color/icon, shared by
 * HCOView.vue's list/card and HCODetailView.vue's detail tab — same reasoning
 * as patientStatus.ts (previously each view had its own copy).
 */
import type AppIcon from "../components/AppIcon.vue";

type Translate = (key: string, ...params: unknown[]) => string;
// Same InstanceType introspection formField.ts/entityActions.ts already use to
// get AppIconName from a plain .ts file — a named type import from a .vue file
// only resolves through this app's "*.vue" ambient shim's default export.
type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

// Values match the real organization_type CHECK constraint (infrastructure/db/schema-snapshot.sql).
export function hcoTypeLabel(t: Translate, type?: string): string {
  switch (type) {
    case "clinic":   return t("user.hco.filters.typeClinic");
    case "hospital": return t("user.hco.filters.typeHospital");
    case "pharmacy": return t("user.hco.filters.typePharmacy");
    case "practice": return t("user.hco.filters.typePractice");
    case "other":    return t("user.hco.filters.typeOther");
    default:         return type || "—";
  }
}

// Values match the real organization_status CHECK constraint.
export function hcoStatusLabel(t: Translate, status?: string): string {
  switch (status) {
    case "active":           return t("user.hco.filters.statusActive");
    case "inactive":         return t("user.hco.filters.statusInactive");
    case "pending_approval": return t("user.hco.filters.statusPendingApproval");
    default:                 return status || "—";
  }
}

export function hcoStatusColor(status?: string): string {
  switch (status) {
    case "active":           return "success";
    case "pending_approval": return "warning";
    default:                 return "default";
  }
}

export function hcoTypeColor(type?: string): string {
  switch (type) {
    case "hospital": return "primary";
    case "clinic":   return "info";
    case "pharmacy": return "secondary";
    default:         return "default";
  }
}

// "practice" -> the doctor/person icon: the DB's private-practice value, distinct
// from "nav-patients" (the plain patient icon) per the ticket's own instruction.
export function hcoTypeIcon(type?: string): AppIconName {
  switch (type) {
    case "hospital": return "hco-hospital";
    case "pharmacy": return "hco-pharmacy";
    case "practice": return "hco-practice";
    case "other":    return "hco-other";
    case "clinic":
    default:         return "nav-hco";
  }
}
