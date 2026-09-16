/**
 * Single source for organization type/status → label/color, shared by
 * HCOView.vue's list/card and HCODetailView.vue's detail tab — same reasoning
 * as patientStatus.ts (previously each view had its own copy).
 */
type Translate = (key: string, ...params: unknown[]) => string;

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
