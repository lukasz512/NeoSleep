export interface Patient {
  id: string;
  name: string;
  diagnosis: string;
  referred_by: string;
  status: string;
  region: string;
  created_at: Date;
}

export interface GetPatientsFilters {
  search?: string;
  status?: string;
  region?: string;
}

// Mock-only until tbl_patients migration is implemented
const MOCK_PATIENTS: Patient[] = [
  { id: "mock-pat-01", name: "Andrzej Kowalski",    diagnosis: "OSA — Obstructive Sleep Apnea",    referred_by: "Dr Kowalska",    status: "active",     region: "Central", created_at: new Date("2025-10-05") },
  { id: "mock-pat-02", name: "Marta Nowak",          diagnosis: "Snoring + Mild OSA",               referred_by: "Dr Nowak",       status: "follow-up",  region: "Central", created_at: new Date("2025-10-08") },
  { id: "mock-pat-03", name: "Tomasz Wierzbicki",   diagnosis: "Severe OSA",                       referred_by: "Dr Wiśniewska",  status: "active",     region: "North",   created_at: new Date("2025-10-10") },
  { id: "mock-pat-04", name: "Katarzyna Jabłońska", diagnosis: "UARS",                             referred_by: "Dr Zieliński",   status: "active",     region: "North",   created_at: new Date("2025-10-12") },
  { id: "mock-pat-05", name: "Paweł Kozłowski",     diagnosis: "Moderate OSA + Hypertension",      referred_by: "Dr Wójcik",      status: "active",     region: "South",   created_at: new Date("2025-10-14") },
  { id: "mock-pat-06", name: "Ewa Malinowska",       diagnosis: "Severe OSA",                       referred_by: "Dr Kaczmarek",   status: "follow-up",  region: "South",   created_at: new Date("2025-10-16") },
  { id: "mock-pat-07", name: "Robert Szymański",    diagnosis: "OSA post-surgery",                 referred_by: "Dr Lewandowska", status: "active",     region: "West",    created_at: new Date("2025-10-18") },
  { id: "mock-pat-08", name: "Agnieszka Wiśniewska",diagnosis: "Mild OSA",                         referred_by: "Dr Dąbrowski",   status: "discharged", region: "West",    created_at: new Date("2025-10-20") },
  { id: "mock-pat-09", name: "Mariusz Krawczyk",    diagnosis: "Severe OSA",                       referred_by: "Dr Szymańska",   status: "active",     region: "Central", created_at: new Date("2025-10-22") },
  { id: "mock-pat-10", name: "Zofia Michalska",      diagnosis: "OSA + GERD",                       referred_by: "Dr Jankowski",   status: "follow-up",  region: "Central", created_at: new Date("2025-10-24") },
  { id: "mock-pat-11", name: "Bartłomiej Kowalczyk",diagnosis: "CPAP non-compliant — Severe OSA",  referred_by: "Dr Kowalczyk",   status: "active",     region: "South",   created_at: new Date("2025-10-26") },
  { id: "mock-pat-12", name: "Natalia Piotrowska",   diagnosis: "Positional OSA",                   referred_by: "Dr Wiśniewski",  status: "active",     region: "North",   created_at: new Date("2025-10-28") },
];

export async function getPatientsPaginated(
  filters: GetPatientsFilters,
  page: number,
  limit: number
): Promise<{ rows: Patient[]; total: number }> {
  let rows = [...MOCK_PATIENTS];
  const q = filters.search?.trim().toLowerCase() ?? "";
  if (q) rows = rows.filter((r) => `${r.name} ${r.diagnosis} ${r.referred_by} ${r.region}`.toLowerCase().includes(q));
  if (filters.status?.trim()) rows = rows.filter((r) => r.status === filters.status);
  if (filters.region?.trim()) rows = rows.filter((r) => r.region === filters.region);
  const total = rows.length;
  return { rows: rows.slice((page - 1) * limit, page * limit), total };
}
