export type LeadStatus = "new" | "ongoing" | "accepted" | "rejected" | "completed";

export const LEAD_STATUS_OPTIONS = ["new", "ongoing", "accepted", "rejected", "completed"] as const;

export const LEAD_STATUS_I18N_KEYS: Record<string, string> = {
  new: "rep.leads.filters.statusNew",
  ongoing: "rep.leads.filters.statusOngoing",
  accepted: "rep.leads.filters.statusAccepted",
  rejected: "rep.leads.filters.statusRejected",
  completed: "rep.leads.filters.statusCompleted",
};

export function leadStatusClass(status: string): LeadStatus {
  const s = (status || "new").toLowerCase();
  return (LEAD_STATUS_OPTIONS as readonly string[]).includes(s) ? (s as LeadStatus) : "new";
}

export function leadStatusI18nKey(status: string): string | undefined {
  return LEAD_STATUS_I18N_KEYS[(status || "new").toLowerCase()];
}
