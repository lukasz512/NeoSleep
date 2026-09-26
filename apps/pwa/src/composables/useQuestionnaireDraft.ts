import { APP_STORAGE_KEYS } from "../constants";

/**
 * The patient's in-progress answers, kept on their own device until they
 * submit (Łukasz, 2026-09-26) — a closed tab, a reload or a phone call
 * doesn't lose what they answered. Health answers on a possibly shared
 * phone, so:
 * - the storage key is a hash of the link token (the token itself, which
 *   opens the questionnaire, is never written to storage);
 * - a step's draft is removed as soon as that step is submitted, every
 *   draft of the link when the link turns out invalid/expired, and any
 *   draft older than DRAFT_TTL_MS whenever the page loads;
 * - storage failures (private mode, quota, blocked site data) are ignored:
 *   the page works the same, the answers just aren't kept.
 */
export interface QuestionnaireDraft {
  answers: Record<string, boolean | null>;
  other: string;
  cursor: number;
  savedAt: number;
}

type DraftFile = Record<string, QuestionnaireDraft>;

/** Same lifetime as the link itself (QUESTIONNAIRE_LINK_TTL_MS in the API). */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const PREFIX = APP_STORAGE_KEYS.questionnaireDraftPrefix;

/** First 16 hex chars of SHA-256(token) — enough to tell links apart, useless for opening one. */
export async function draftKeyFor(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${PREFIX}${hex.slice(0, 16)}`;
}

function read(key: string): DraftFile {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as DraftFile) : {};
  } catch {
    // benign: storage unavailable or a corrupt entry — behave as if nothing was saved.
    return {};
  }
}

function write(key: string, file: DraftFile): void {
  try {
    if (Object.keys(file).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(file));
  } catch {
    // benign: storage unavailable or full — the answers just aren't kept across reloads.
  }
}

/** Drops every draft (of any link) older than the TTL. Run on page load. */
export function purgeExpiredDrafts(now = Date.now()): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const file = read(key);
      const kept = Object.fromEntries(Object.entries(file).filter(([, draft]) => now - (draft?.savedAt ?? 0) < DRAFT_TTL_MS));
      write(key, kept);
    }
  } catch {
    // benign: storage unavailable — nothing to purge.
  }
}

export function useQuestionnaireDraft(key: string) {
  return {
    load(step: string, now = Date.now()): QuestionnaireDraft | null {
      const draft = read(key)[step];
      if (!draft || now - draft.savedAt >= DRAFT_TTL_MS) return null;
      return draft;
    },
    save(step: string, draft: Omit<QuestionnaireDraft, "savedAt">, now = Date.now()): void {
      write(key, { ...read(key), [step]: { ...draft, savedAt: now } });
    },
    /** The step was submitted — its answers now live on the server only. */
    clearStep(step: string): void {
      const file = read(key);
      delete file[step];
      write(key, file);
    },
    /** The link is dead (used, cancelled, expired) — nothing of it stays on the device. */
    clearAll(): void {
      write(key, {});
    },
  };
}
