import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { apiFetch, extractErrorMessage } from "./useApi";
import { useNotifications } from "./useNotifications";
import type { ClinicalRecordKind } from "../config/questionnaires";

/**
 * The patient's Estudios checklist (NEO-36 part 2, ADR-024) — API:
 * /api/v1/patient/:id/checklist (+ print, uploads, questionnaire-requests,
 * clinical-records). Admin/doctor only.
 *
 * Every call passes handleErrors:false and shows the server's own message
 * (falling back to a translated one), so one failure is one toast that
 * says what actually went wrong.
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

  async function failWith(res: Response, fallbackKey: string): Promise<void> {
    const bodyText = await res.text().catch(() => "");
    notifications.show(extractErrorMessage(bodyText) || t(fallbackKey), "error");
  }

  async function load(): Promise<void> {
    loading.value = true;
    loadError.value = false;
    try {
      const res = await apiFetch(`/api/v1/patient/${patientId()}/checklist`, { handleErrors: false });
      if (!res.ok) {
        loadError.value = true;
        return;
      }
      checklist.value = (await res.json()) as PatientChecklist;
    } catch {
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function send(path: string, init: RequestInit, errorKey: string, successKey?: string): Promise<Response | null> {
    const res = await apiFetch(`/api/v1/patient/${patientId()}${path}`, { ...init, handleErrors: false });
    if (!res.ok) {
      await failWith(res, errorKey);
      return null;
    }
    if (successKey) notifications.show(t(successKey), "success");
    await load();
    return res;
  }

  const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  function recordQuestionnaire(kind: ClinicalRecordKind, answers: Record<string, unknown>) {
    return send(`/clinical-records/${kind}`, json(answers), "app.clinical.saveError", "app.clinical.saveSuccess").then(Boolean);
  }

  function completeBang(recordId: string, answers: Record<string, unknown>) {
    return send(`/clinical-records/stop_bang/${recordId}`, { ...json(answers), method: "PATCH" }, "app.clinical.saveError", "app.clinical.saveSuccess").then(Boolean);
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
      await failWith(res, "app.clinical.generatePdfError");
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
      await failWith(res, "app.clinical.openFileError");
      return;
    }
    const { url } = (await res.json()) as { url: string };
    if (tab) tab.location.href = url;
    else window.open(url, "_blank", "noopener");
  }

  /** No items → one link for everything the patient still has to do. */
  async function createRequest(items?: string[]): Promise<PendingRequest | null> {
    const res = await send("/questionnaire-requests", json(items ? { items } : {}), "app.clinical.qr.createError");
    return res ? ((await res.json()) as PendingRequest) : null;
  }

  async function cancelRequest(requestId: string): Promise<void> {
    await send(`/questionnaire-requests/${requestId}`, { method: "DELETE" }, "app.clinical.saveError");
  }

  async function upload(form: FormData): Promise<boolean> {
    const res = await send("/studies/uploads", { method: "POST", body: form }, "app.clinical.upload.error", "app.clinical.upload.success");
    return Boolean(res);
  }

  async function deleteUpload(attachmentId: string): Promise<void> {
    await send(`/studies/uploads/${attachmentId}`, { method: "DELETE" }, "app.clinical.upload.deleteError", "app.clinical.upload.deleted");
  }

  return { checklist, loading, loadError, load, recordQuestionnaire, completeBang, print, openFile, createRequest, cancelRequest, upload, deleteUpload };
}
