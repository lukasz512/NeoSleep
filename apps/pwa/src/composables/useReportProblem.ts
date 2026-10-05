/**
 * "Report a problem" — shared open state for the one dialog mounted in AppLayout, plus the
 * submit that builds the multipart request. Context attached automatically is limited to what
 * helps us reproduce: the page path (no query string or fragment), app version, viewport and the
 * last errors of this session (already scrubbed by reportCaught). No form or request bodies.
 */
import { reactive } from "vue";
import { getRecentErrors } from "@api";
import { browserStorage, getPrefsIdentity, prefsKey, readPref, removePref, writePref } from "@prefs";
import { apiFetch } from "./useApi";
import type { ProblemKind } from "../types/issues";

export interface ReportProblemPrefill {
  /** The failing request's X-Request-ID, when the report starts from an error screen. */
  requestId?: string | null;
  /** Where the user was, e.g. the route name. */
  where?: string;
}

export interface ReportProblemForm {
  kind: ProblemKind;
  description: string;
  file?: File | null;
  appVersion: string;
}

export type ReportProblemResult = { ok: true; number: number } | { ok: false; status: number | null };

export const MAX_REQUEST_IDS = 20;

const state = reactive<{ open: boolean; prefill: ReportProblemPrefill }>({ open: false, prefill: {} });

export function openReportProblem(prefill: ReportProblemPrefill = {}): void {
  state.prefill = { ...prefill };
  state.open = true;
}

export function closeReportProblem(): void {
  state.open = false;
}

/** Origin + pathname only — the query string and fragment can carry names or single-use credentials. */
export function currentPageUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export function buildReportFormData(form: ReportProblemForm, prefill: ReportProblemPrefill): FormData {
  const recentErrors = getRecentErrors();
  const requestIds: string[] = [];
  for (const id of [prefill.requestId, ...recentErrors.map((e) => e.request_id)]) {
    if (id && !requestIds.includes(id)) requestIds.push(id);
  }
  const data = new FormData();
  data.append("kind", form.kind);
  data.append("description", form.description.trim());
  data.append("page_url", currentPageUrl());
  data.append("app_version", form.appVersion);
  data.append("viewport", `${window.innerWidth}x${window.innerHeight}`);
  data.append("request_ids", JSON.stringify(requestIds.slice(0, MAX_REQUEST_IDS)));
  data.append("recent_errors", JSON.stringify(recentErrors));
  if (form.file) data.append("file", form.file);
  return data;
}

async function submit(form: ReportProblemForm): Promise<ReportProblemResult> {
  try {
    // handleErrors: false — the dialog words 429 and other failures itself; a failed
    // report must not also toast and re-enter the error pipeline.
    const res = await apiFetch("/api/v1/problem-reports", {
      method: "POST",
      body: buildReportFormData(form, state.prefill),
      handleErrors: false,
    });
    if (!res.ok) return { ok: false, status: res.status };
    const body = (await res.json()) as { number: number };
    return { ok: true, number: body.number };
  } catch {
    // benign: offline or timeout — the dialog shows a retry message; reporting a failed
    // report would loop.
    return { ok: false, status: null };
  }
}

/**
 * Trackable reports: a report that could not be sent (offline, server down) is kept on this
 * device for the signed-in user and comes back the next time the dialog opens, so it never
 * silently disappears. Text and kind only (never the file); dropped after a week or once sent.
 */
export interface ReportDraft {
  kind: ProblemKind;
  description: string;
}

const DRAFT_SLOT = "reportDraft";
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const KINDS: readonly ProblemKind[] = ["problem", "suggestion", "other"];

function draftKey(): string | null {
  const id = getPrefsIdentity();
  return id ? prefsKey(id, DRAFT_SLOT) : null;
}

export function saveReportDraft(draft: ReportDraft): boolean {
  const key = draftKey();
  return key ? writePref(browserStorage(), key, { kind: draft.kind, description: draft.description }) : false;
}

export function readReportDraft(): ReportDraft | null {
  const key = draftKey();
  if (!key) return null;
  const value = readPref(browserStorage(), key, Date.now(), DRAFT_MAX_AGE_MS);
  if (!value || typeof value !== "object") return null;
  const { kind, description } = value as Record<string, unknown>;
  if (typeof description !== "string" || !description.trim()) return null;
  return { kind: KINDS.includes(kind as ProblemKind) ? (kind as ProblemKind) : "problem", description };
}

export function clearReportDraft(): void {
  const key = draftKey();
  if (key) removePref(browserStorage(), key);
}

export function useReportProblem() {
  return { state, open: openReportProblem, close: closeReportProblem, submit };
}
