export interface LeadFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: string;
  region: string;
  institution: string;
}

export interface LeadFormInitialData {
  id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  status?: string;
  region?: string;
  institution?: string;
}

export interface LeadSubmitPayload {
  id?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  status: string;
  region?: string;
  institution?: string;
}
