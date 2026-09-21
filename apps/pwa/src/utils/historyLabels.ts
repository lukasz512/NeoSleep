/**
 * History entry action → icon/color, and entity_type → humanized label, shared
 * by EntityHistoryPanel.vue's timeline — same icon/color-mapping convention as
 * hcoLabels.ts/hcpLabels.ts. `action` values come from audit_log rows written
 * by apps/api/src/queries/auditLog.ts (create/update/delete/read/restore).
 */
import type AppIcon from "../components/AppIcon.vue";

type Translate = (key: string, ...params: unknown[]) => string;
type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

export function historyActionIcon(action: string): AppIconName {
  switch (action) {
    case "create":  return "plus-circle";
    case "update":  return "pencil";
    case "delete":  return "trash";
    case "restore": return "refresh";
    case "read":    return "eye";
    default:        return "info-circle";
  }
}

// A real Vuetify theme color for every case (never the unthemed "default"
// token) — the timeline dot forces its icon to a fixed contrasting color, so
// an unthemed dot background would leave read/unknown entries illegible.
export function historyActionColor(action: string): string {
  switch (action) {
    case "create":  return "success";
    case "update":  return "info";
    case "delete":  return "error";
    case "restore": return "warning";
    case "read":    return "secondary";
    default:        return "secondary";
  }
}

// `entity_type` is the audit_log row's model name (Patient/Practitioner/
// Organization/SleepStudy/TreatmentPlan) — see AUDIT_FIELD_ALLOWLIST in
// apps/api/src/queries/auditLog.ts for the same set. Falls back to the raw
// value for any type not yet covered here (fail visible, not fail silent).
export function historyEntityTypeLabel(t: Translate, entityType: string): string {
  const key = `app.history.entityType.${entityType}`;
  const translated = t(key);
  return translated === key ? entityType : translated;
}
