export interface EventFormData {
  title: string;
  start: string;
  end: string;
  type: "f2f" | "video";
  status: string;
  hcoIds: string[];
  hcpIds: string[];
  patientIds: string[];
  /** The one patient the event is for (encounter.patient_id, CORE-137) — shows on their card and History. */
  patientId: string | null;
  location: string;
  videoLink: string;
  notes: string;
  region: string;
}

export interface EventFormInitialData {
  id?: string;
  title?: string;
  start?: string;
  end?: string;
  start_at?: string;
  end_at?: string;
  type?: "f2f" | "video";
  status?: string;
  hcoIds?: string[];
  hcpIds?: string[];
  patientIds?: string[];
  patientId?: string | null;
  patient_id?: string | null;
  attendees?: { attendee_type: string; attendee_id: string }[];
  location?: string;
  video_link?: string;
  videoLink?: string;
  notes?: string;
  region?: string;
}

export interface EventSubmitPayload {
  id?: string;
  title: string;
  start_at: string;
  end_at: string;
  type: "f2f" | "video";
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  location?: string | null;
  video_link?: string | null;
  notes?: string | null;
  region: string;
  patient_id?: string | null;
  attendees: { attendee_type: "doctor" | "hco" | "lead" | "patient"; attendee_id: string; is_primary?: boolean }[];
}
