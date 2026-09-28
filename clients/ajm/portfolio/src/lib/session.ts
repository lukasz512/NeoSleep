/**
 * Per-tab memory: the entry plays once per session and a reload returns to the section
 * the visitor was reading. sessionStorage only: no cookies, nothing leaves the device (C1).
 * Storage can be blocked (private mode, embedded previews), so every access is guarded.
 */
const ENTRY_KEY = "ajm.entry.played";
const SECTION_KEY = "ajm.section";

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // benign: storage blocked (private mode / sandboxed iframe) — page works without memory
    return null;
  }
}

export function entryPlayed(): boolean {
  return store()?.getItem(ENTRY_KEY) === "1";
}

export function markEntryPlayed(): void {
  try {
    store()?.setItem(ENTRY_KEY, "1");
  } catch {
    // benign: quota or blocked storage — the entry just plays again next time
  }
}

export function lastSection(): string | null {
  return store()?.getItem(SECTION_KEY) ?? null;
}

export function rememberSection(id: string): void {
  try {
    store()?.setItem(SECTION_KEY, id);
  } catch {
    // benign: quota or blocked storage — reload simply starts at the top
  }
}
