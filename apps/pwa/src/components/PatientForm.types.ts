export interface PatientFormData {
  salutation: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  practitioner_id: string;
  status: string;
  region: string;
  ahi_baseline: string;
  cpap_device: string;
  medical_record: string;
}

export interface PatientFormInitialData {
  id?: string;
  salutation?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  practitioner_id?: string;
  status?: string;
  region?: string;
  ahi_baseline?: number | null;
  cpap_device?: string;
  medical_record?: string;
}

export interface PatientSubmitPayload {
  id?: string;
  salutation?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  practitioner_id?: string;
  status?: string;
  region?: string;
  ahi_baseline?: number;
  cpap_device?: string;
  medical_record?: string;
}
