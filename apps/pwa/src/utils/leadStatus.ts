// Matches lead_status_check in the DB exactly — no UI-vocabulary translation layer.
export type LeadStatus = "new" | "contacted" | "qualified" | "inactive" | "converted";

export const LEAD_STATUS_OPTIONS = ["new", "contacted", "qualified", "inactive", "converted"] as const;

export const LEAD_STATUS_I18N_KEYS: Record<string, string> = {
  new: "user.leads.filters.statusNew",
  contacted: "user.leads.filters.statusContacted",
  qualified: "user.leads.filters.statusQualified",
  inactive: "user.leads.filters.statusInactive",
  converted: "user.leads.filters.statusConverted",
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
