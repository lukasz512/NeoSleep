export interface PractitionerFormData {
  salutation: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  primary_specialty: string;
  institution: string;
  region: string;
  influence_tier: string;
  language: string;
  /** Single free-text national ID value, wrapped into national_ids JSON on submit. */
  national_id: string;
}

export interface PractitionerFormInitialData {
  id?: string;
  salutation?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  primary_specialty?: string;
  /** Legacy alias — read as a fallback when primary_specialty isn't set. */
  specialty?: string;
  institution?: string;
  region?: string;
  influence_tier?: string;
  language?: string;
  national_ids?: Record<string, string> | null;
}

export interface PractitionerSubmitPayload {
  id?: string;
  salutation?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  primary_specialty?: string;
  institution?: string;
  region?: string;
  influence_tier?: string;
  language?: string;
  national_ids?: Record<string, string> | null;
}
