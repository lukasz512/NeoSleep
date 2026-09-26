import { reportCaught, reportFailedResponse } from "@api";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { apiFetch, extractErrorMessage } from "./useApi";
import { retryAction, useNotifications, type NotificationIcon } from "./useNotifications";
import type { ClinicalRecordKind } from "../config/questionnaires";

/**
 * The patient's Estudios checklist (NEO-36 part 2, ADR-024) — API:
 * /api/v1/patient/:id/checklist (+ print, uploads, questionnaire-requests,
 * clinical-records). Admin/doctor only.
 *
 * Every call passes handleErrors:false and shows the server's own message
 * (falling back to a translated one), so one failure is one toast that
 * says what actually went wrong. Fire-and-forget calls (print, open, delete,
 * cancel) put Retry on that toast; calls whose result a dialog is waiting for
 * (save, upload, create link) don't — the dialog stays open and is the retry.
 */

export type ChecklistStatus = "missing" | "pending_patient" | "partial" | "done";
export type ChecklistGroup = "consent" | "patient" | "doctor" | "results";

export interface ChecklistRecord {
  kind: ClinicalRecordKind;
  id: string;
  created_at: string;
  source: "staff" | "patient";
  recorded_by_name: string | null;
  score?: number | null;
  medical_history_other?: string | null;
  skeletal_class?: "I" | "II" | "III" | null;
  tooth?: string | null;
  /** STOP-Bang measurements (migration 034) — null when B/N were answered as a plain yes/no. */
  height_cm?: number | null;
  weight_kg?: number | null;
  neck_cm?: number | null;
  bmi?: number | null;
  /** STOP-Bang: when B-A-N-G was completed (equals created_at when both halves were filled at once). */
  updated_at?: string;
  [question: string]: unknown;
}

export interface ChecklistHistoryEntry {
  id: string;
  type: "record" | "consent" | "upload" | "sleep_study";
  created_at: string;
  source: "staff" | "patient";
  by: string | null;
  record?: ChecklistRecord;
  file_attachment_id?: string | null;
  title?: string | null;
  notes?: string | null;
  filename?: string | null;
  sleep_study_id?: string | null;
  sleep_study?: {
    id: string;
    status: string;
    study_date: string | null;
    ahi_score: number | null;
    spo2_nadir: number | null;
    odi: number | null;
    interpretation: string | null;
  };
}

export interface ChecklistItem {
  key: string;
  templateKey: string | null;
  label: string;
  fillMode: "consent" | "patient" | "doctor" | "external";
  group: ChecklistGroup;
  status: ChecklistStatus;
  completed_at: string | null;
  history: ChecklistHistoryEntry[];
  pending_request_id: string | null;
  actions: { qr: boolean; fill: "questionnaire" | "sleep_study" | null; form: ClinicalRecordKind | null; print: boolean; upload: boolean };
}

export interface PendingRequest {
  id: string;
  items: string[];
  completed_items: string[];
  expires_at: string;
  /** Only right after creation — never stored, so it can't be re-shown later. */
  url?: string;
}

export interface PatientChecklist {
  items: ChecklistItem[];
  other_uploads: ChecklistHistoryEntry[];
  pending_requests: PendingRequest[];
  summary: { done: number; total: number };
}

export function usePatientChecklist(patientId: () => string) {
  const { t } = useI18n();
  const notifications = useNotifications();

  const checklist = ref<PatientChecklist | null>(null);
  const loading = ref(false);
  const loadError = ref(false);
  /** The error behind loadError (NEO-81) — lets the error state say offline vs. server problem. */
  const loadFailure = ref<unknown>(null);

  async function failWith(
    res: Response,
    fallbackKey: string,
    icon: NotificationIcon,
    retry?: () => Promise<unknown>,
  ): Promise<void> {
    // Requests here use handleErrors: false, so apiFetch did not report this failure — do it once here.
    await reportFailedResponse(res, { where: `usePatientChecklist:${fallbackKey}` });
    // benign: an unreadable body only loses the server message; the fallback key is shown instead.
    const bodyText = await res.text().catch(() => "");
    notifications.show(extractErrorMessage(bodyText) || t(fallbackKey), "error", undefined, {
      icon,
      action: retry ? retryAction(() => void retry()) : undefined,
    });
  }

  async function load(): Promise<void> {
    loading.value = true;
    loadError.value = false;
    loadFailure.value = null;
    try {
      const res = await apiFetch(`/api/v1/patient/${patientId()}/checklist`, { handleErrors: false });
      if (!res.ok) {
        loadFailure.value = await reportFailedResponse(res, { where: "usePatientChecklist.load" });
        loadError.value = true;
        return;
      }
      checklist.value = (await res.json()) as PatientChecklist;
    } catch (err) {
      reportCaught(err, { where: "usePatientChecklist.load" });
      loadFailure.value = err;
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  interface SendToast {
    icon: NotificationIcon;
    errorKey: string;
    successKey?: string;
    /** Only for calls nobody awaits a result from — see the header comment. */
    retryable?: boolean;
  }

  async function send(path: string, init: RequestInit, toast: SendToast): Promise<Response | null> {
    const res = await apiFetch(`/api/v1/patient/${patientId()}${path}`, { ...init, handleErrors: false });
    if (!res.ok) {
      await failWith(res, toast.errorKey, toast.icon, toast.retryable ? () => send(path, init, toast) : undefined);
      return null;
    }
    if (toast.successKey) notifications.show(t(toast.successKey), "success", undefined, { icon: toast.icon });
    await load();
    return res;
  }

  const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  function recordQuestionnaire(kind: ClinicalRecordKind, answers: Record<string, unknown>) {
    return send(`/clinical-records/${kind}`, json(answers), { icon: "form-screening", errorKey: "app.clinical.saveError", successKey: "app.clinical.saveSuccess" }).then(Boolean);
  }

  function completeBang(recordId: string, answers: Record<string, unknown>) {
    return send(`/clinical-records/stop_bang/${recordId}`, { ...json(answers), method: "PATCH" }, { icon: "form-screening", errorKey: "app.clinical.saveError", successKey: "app.clinical.saveSuccess" }).then(Boolean);
  }

  /**
   * Opens the print PDF in a new tab: a freshly rendered one (streamed as a
   * blob) or, for a signed consent, the stored document. The tab is opened
   * synchronously inside the click so popup blockers (Safari) allow it.
   */
  async function print(key: string, recordId?: string): Promise<void> {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null; // what "noopener" would do — passing it would make window.open return null
    const res = await apiFetch(`/api/v1/patient/${patientId()}/checklist/${key}/print`, { ...json(recordId ? { recordId } : {}), handleErrors: false });
    if (!res.ok) {
      tab?.close();
      await failWith(res, "app.clinical.generatePdfError", "printer", () => print(key, recordId));
      return;
    }
    const target = res.headers.get("Content-Type")?.includes("application/pdf")
      ? URL.createObjectURL(await res.blob())
      : ((await res.json()) as { url: string }).url;
    if (tab) tab.location.href = target;
    else window.open(target, "_blank", "noopener");
  }

  /** Opens a stored file (signed consent, uploaded study, or a PDF attached to a sleep study) via its download endpoint. */
  async function openFile(fileAttachmentId: string, sleepStudyId?: string | null): Promise<void> {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    const path = sleepStudyId
      ? `/api/v1/sleep-study/${sleepStudyId}/attachments/${fileAttachmentId}/download`
      : `/api/v1/patient/${patientId()}/documents/${fileAttachmentId}/download`;
    const res = await apiFetch(path, { handleErrors: false });
    if (!res.ok) {
      tab?.close();
      await failWith(res, "app.clinical.openFileError", "file", () => openFile(fileAttachmentId, sleepStudyId));
      return;
    }
    const { url } = (await res.json()) as { url: string };
    if (tab) tab.location.href = url;
    else window.open(url, "_blank", "noopener");
  }

  /** No items → one link for everything the patient still has to do. */
  async function createRequest(items?: string[]): Promise<PendingRequest | null> {
    const res = await send("/questionnaire-requests", json(items ? { items } : {}), { icon: "qr-code", errorKey: "app.clinical.qr.createError" });
    return res ? ((await res.json()) as PendingRequest) : null;
  }

  /**
   * Emails the patient one personal link to everything they can still fill.
   * A patient without an email gets a clear "add one to the record" message,
   * not a generic failure. Returns the masked address it went to, or null.
   */
  async function sendByEmail(): Promise<string | null> {
    const res = await apiFetch(`/api/v1/patient/${patientId()}/questionnaire-requests/email`, { ...json({}), handleErrors: false });
    if (res.status === 422) {
      notifications.show(t("app.clinical.email.noEmail"), "warning", undefined, { icon: "mail" });
      return null;
    }
    if (!res.ok) {
      await failWith(res, "app.clinical.email.failed", "mail", () => sendByEmail());
      return null;
    }
    const { sent_to } = (await res.json()) as { sent_to: string };
    notifications.show(t("app.clinical.email.sent", { email: sent_to }), "success", undefined, { icon: "mail" });
    await load();
    return sent_to;
  }

  async function cancelRequest(requestId: string): Promise<void> {
    await send(`/questionnaire-requests/${requestId}`, { method: "DELETE" }, { icon: "qr-code", errorKey: "app.clinical.saveError", retryable: true });
  }

  async function upload(form: FormData): Promise<boolean> {
    const res = await send("/studies/uploads", { method: "POST", body: form }, { icon: "upload", errorKey: "app.clinical.upload.error", successKey: "app.clinical.upload.success" });
    return Boolean(res);
  }

  async function deleteUpload(attachmentId: string): Promise<void> {
    await send(`/studies/uploads/${attachmentId}`, { method: "DELETE" }, { icon: "file", errorKey: "app.clinical.upload.deleteError", successKey: "app.clinical.upload.deleted", retryable: true });
  }

  return { checklist, loading, loadError, loadFailure, load, recordQuestionnaire, completeBang, print, openFile, createRequest, sendByEmail, cancelRequest, upload, deleteUpload };
}
