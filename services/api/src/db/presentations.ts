import { getDb } from "./connection.js";

export interface Presentation {
  id: string;
  title: string;
  url: string;
  file_type: string;
  thumbnail_url: string | null;
  created_at: Date;
}

const MOCK_PRESENTATIONS: Presentation[] = [
  { id: "mock-1", title: "NeoSleep — Sleep Therapy Program",                    url: "https://www.africau.edu/images/default/sample.pdf", file_type: "pdf", thumbnail_url: null, created_at: new Date() },
  { id: "mock-2", title: "OrthApnea — Mandibular Advancement Device",           url: "https://www.africau.edu/images/default/sample.pdf", file_type: "pdf", thumbnail_url: null, created_at: new Date() },
  { id: "mock-3", title: "Clinical Evidence — Sleep-Disordered Breathing",      url: "https://www.africau.edu/images/default/sample.pdf", file_type: "pdf", thumbnail_url: null, created_at: new Date() },
  { id: "mock-4", title: "HCP Guide — Diagnosing Obstructive Sleep Apnea",      url: "https://www.africau.edu/images/default/sample.pdf", file_type: "pdf", thumbnail_url: null, created_at: new Date() },
  { id: "mock-5", title: "Patient Journey — From Diagnosis to Treatment",       url: "https://www.africau.edu/images/default/sample.pdf", file_type: "pdf", thumbnail_url: null, created_at: new Date() },
  { id: "mock-6", title: "NeoSleep Pro — Advanced CPAP Solutions",              url: "https://www.africau.edu/images/default/sample.pdf", file_type: "pdf", thumbnail_url: null, created_at: new Date() },
];

export async function getPresentations(): Promise<Presentation[]> {
  const p = getDb();
  if (!p) return MOCK_PRESENTATIONS;
  try {
    const result = await p.query<Presentation>(
      "SELECT id, title, url, file_type, thumbnail_url, created_at FROM tbl_presentations ORDER BY created_at DESC"
    );
    return result.rows.length > 0 ? result.rows : MOCK_PRESENTATIONS;
  } catch {
    return MOCK_PRESENTATIONS;
  }
}

export async function getPresentationById(id: string): Promise<Presentation | null> {
  const p = getDb();
  if (!p) return MOCK_PRESENTATIONS.find((pr) => pr.id === id) ?? null;
  try {
    const result = await p.query<Presentation>(
      "SELECT id, title, url, file_type, thumbnail_url, created_at FROM tbl_presentations WHERE id = $1",
      [id]
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}
