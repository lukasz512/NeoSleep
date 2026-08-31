// Matches lead_status_check in the DB exactly — no UI-vocabulary translation layer.
// 'qualified'/'inactive' are legacy — kept so old rows still render, but no
// longer offered as choices anywhere new leads are created or edited (see
// leadForm.ts). 'declined' is admin-only visibility (see LeadsView.vue).
export type LeadStatus =
  | "new" | "contacted" | "follow_up_needed" | "meeting_scheduled" | "declined" | "converted"
  | "qualified" | "inactive";

export const LEAD_STATUS_OPTIONS = [
  "new", "contacted", "follow_up_needed", "meeting_scheduled", "declined", "converted",
  "qualified", "inactive",
] as const;

export const LEAD_STATUS_I18N_KEYS: Record<string, string> = {
  new: "user.leads.filters.statusNew",
  contacted: "user.leads.filters.statusContacted",
  follow_up_needed: "user.leads.filters.statusFollowUpNeeded",
  meeting_scheduled: "user.leads.filters.statusMeetingScheduled",
  declined: "user.leads.filters.statusDeclined",
  converted: "user.leads.filters.statusConverted",
  qualified: "user.leads.filters.statusQualified",
  inactive: "user.leads.filters.statusInactive",
};

function isLeadStatus(s: string): s is LeadStatus {
  return (LEAD_STATUS_OPTIONS as readonly string[]).includes(s);
}

export function leadStatusClass(status: string): LeadStatus {
  const s = (status || "new").toLowerCase();
  return isLeadStatus(s) ? s : "new";
}

export function leadStatusI18nKey(status: string): string | undefined {
  return LEAD_STATUS_I18N_KEYS[(status || "new").toLowerCase()];
}

/** institution has no dedicated column on lead — it lives at metadata.institution
 *  (see apps/api/src/commands/lead.ts). */
export function leadInstitution(lead: { metadata?: Record<string, unknown> | null }): string {
  const v = lead.metadata?.institution;
  return typeof v === "string" ? v : "";
}
