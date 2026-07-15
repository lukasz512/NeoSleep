export interface OrganizationFormData {
  name: string;
  type: string;
  status: string;
  region: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  phone: string;
  email: string;
  website: string;
}

export interface OrganizationFormInitialData {
  id?: string;
  name?: string;
  type?: string;
  status?: string;
  region?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
  phone?: string;
  email?: string;
  website?: string;
}

export interface OrganizationSubmitPayload {
  id?: string;
  name: string;
  type?: string;
  status?: string;
  region?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
  phone?: string;
  email?: string;
  website?: string;
}
