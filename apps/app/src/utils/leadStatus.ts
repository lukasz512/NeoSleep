export type LeadStatus = "new" | "ongoing" | "accepted" | "rejected" | "completed";

export const LEAD_STATUS_OPTIONS = ["new", "ongoing", "accepted", "rejected", "completed"] as const;

export const LEAD_STATUS_I18N_KEYS: Record<string, string> = {
  new: "user.leads.filters.statusNew",
  ongoing: "user.leads.filters.statusOngoing",
  accepted: "user.leads.filters.statusAccepted",
  rejected: "user.leads.filters.statusRejected",
  completed: "user.leads.filters.statusCompleted",
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
