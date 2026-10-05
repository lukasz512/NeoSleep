/**
 * "Report a problem" — shared open state for the one dialog mounted in AppLayout, plus the
 * submit that builds the multipart request. Context attached automatically is limited to what
 * helps us reproduce: the page path (no query string or fragment), app version, viewport and the
 * last errors of this session (already scrubbed by reportCaught). No form or request bodies.
 */
import { reactive } from "vue";
import { getRecentErrors } from "@api";
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

export function useReportProblem() {
  return { state, open: openReportProblem, close: closeReportProblem, submit };
}
