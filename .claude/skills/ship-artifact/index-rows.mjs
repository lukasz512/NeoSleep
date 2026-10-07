// Change Index rows (CORE-105). The index page is a static shell that renders the
// `changes` collection of its Artifact database; each ship writes one document there
// (doc id = ticket) instead of reading and republishing the whole page.

export const COLLECTION = "changes";
/** ArtifactData batch limit. */
export const BATCH_SIZE = 50;
const ROW_FIELDS = ["ticket", "title", "headline", "status", "updated", "branch", "artifact", "linear", "vscode", "pr"];

/** A database doc id: one path segment of [A-Za-z0-9_-.~:@+]; ticketless changes fall back to the branch. */
export function docId(entry) {
  const raw = entry.ticket || entry.branch || "";
  const id = String(raw).replace(/[^A-Za-z0-9_\-.~:@+]/g, "-").slice(0, 200);
  if (!id || id === "." || id === "..") throw new Error(`index row has neither ticket nor branch: ${JSON.stringify(entry).slice(0, 120)}`);
  return id;
}

/** Only the known fields, so a stray draft key never lands in the shared database. */
export function toRow(entry) {
  const row = {};
  for (const k of ROW_FIELDS) row[k] = entry[k] ?? null;
  return row;
}

/** Splits rows into ArtifactData batch `writes` (set, no if_version: only for a first import into an empty collection). */
export function importBatches(entries, filePathOf) {
  const writes = entries.map((e) => ({ op: "set", collection: COLLECTION, doc_id: docId(e), file_path: filePathOf(e) }));
  const batches = [];
  for (let i = 0; i < writes.length; i += BATCH_SIZE) batches.push(writes.slice(i, i + BATCH_SIZE));
  return batches;
}
