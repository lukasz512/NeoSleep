/**
 * Data access for the admin Issues view: problem reports (tenant admins) and grouped
 * diagnostics (platform admins only). Every call reports a failure once and rethrows, so the
 * caller only decides what to show.
 */
import { isApiError, reportCaught, reportFailedResponse } from "@api";
import { apiFetch } from "./useApi";
import type {
  DiagnosticGroup,
  DiagnosticStatus,
  ProblemReport,
  ProblemReportPatch,
  ProblemStatus,
} from "../types/issues";

async function request<T>(where: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, { ...init, handleErrors: false });
  } catch (err) {
    reportCaught(err, { where });
    throw err;
  }
  if (!res.ok) throw await reportFailedResponse(res, { where, path, method: init?.method ?? "GET" });
  return (await res.json()) as T;
}

/** The API answers `{ items }`; a bare array is tolerated so a backend change can't blank the view. */
export function unwrapItems<T>(body: { items?: T[] } | T[] | null | undefined): T[] {
  if (Array.isArray(body)) return body;
  return body?.items ?? [];
}

/** Whether the signed-in admin may also see the platform-wide Errors tab. A failed check means "no". */
export async function fetchPlatformAdmin(): Promise<boolean> {
  try {
    const body = await request<{ platformAdmin?: boolean }>("useIssues.access", "/api/v1/admin/issues/access");
    return body.platformAdmin === true;
  } catch (err) {
    if (isApiError(err)) return false;
    throw err;
  }
}

export async function fetchReports(status: ProblemStatus | "all"): Promise<ProblemReport[]> {
  const query = status === "all" ? "" : `?status=${status}`;
  return unwrapItems(await request<{ items?: ProblemReport[] } | ProblemReport[]>("useIssues.reports", `/api/v1/admin/problem-reports${query}`));
}

export function patchReport(id: string, patch: ProblemReportPatch): Promise<ProblemReport> {
  return request<ProblemReport>("useIssues.patchReport", `/api/v1/admin/problem-reports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function fetchAttachmentUrl(id: string): Promise<string> {
  const body = await request<{ url: string }>("useIssues.attachment", `/api/v1/admin/problem-reports/${encodeURIComponent(id)}/attachment`);
  return body.url;
}

export async function fetchDiagnostics(status: DiagnosticStatus | "all"): Promise<DiagnosticGroup[]> {
  const body = await request<{ items?: DiagnosticGroup[] } | DiagnosticGroup[]>(
    "useIssues.diagnostics",
    `/api/v1/admin/diagnostics?status=${status}&env=production`,
  );
  return unwrapItems(body);
}

export function patchDiagnostic(id: string, status: DiagnosticStatus): Promise<DiagnosticGroup> {
  return request<DiagnosticGroup>("useIssues.patchDiagnostic", `/api/v1/admin/diagnostics/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}
