import { reactive } from "vue";
import { reportCaught } from "@api";
import { apiFetch } from "./useApi";

/**
 * The signed-in user's opened state for the app's own PDFs on Resources.
 * Module-level, like useResourceProgress: the cards and the counts read one
 * map. Opened = completed; saved on the server so it follows the doctor
 * across devices. A missed save never interrupts opening the file.
 */
export interface OwnDocumentProgress {
  resourceId: string;
  status: "not_started" | "completed";
  completedAt: string | null;
  updatedAt: string;
}

const BASE = "/api/v1/resources/documents";

/** id -> when it was opened; no entry = not opened. */
const opened = reactive<Record<string, { completedAt: string | null }>>({});

async function load(): Promise<void> {
  try {
    const res = await apiFetch(`${BASE}/progress`, { handleErrors: false });
    if (!res.ok) return;
    const data = (await res.json()) as { progress: OwnDocumentProgress[] };
    for (const key of Object.keys(opened)) delete opened[key];
    for (const row of data.progress) if (row.status === "completed") opened[row.resourceId] = { completedAt: row.completedAt };
  } catch (err) {
    reportCaught(err, { where: "useFeaturedProgress.load" });
  }
}

async function save(id: string, method: "PUT" | "DELETE"): Promise<void> {
  try {
    await apiFetch(`${BASE}/${encodeURIComponent(id)}/opened`, { method, handleErrors: false });
  } catch (err) {
    reportCaught(err, { where: "useFeaturedProgress.save" });
  }
}

/** Shows at once (the file opens in the same click), then saves. A second open keeps the first date. */
async function markOpened(id: string): Promise<void> {
  if (!opened[id]) opened[id] = { completedAt: new Date().toISOString() };
  await save(id, "PUT");
}

async function markNotOpened(id: string): Promise<void> {
  delete opened[id];
  await save(id, "DELETE");
}

export function useFeaturedProgress() {
  return { opened, load, markOpened, markNotOpened };
}
