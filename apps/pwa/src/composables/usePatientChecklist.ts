import { reportCaught, reportFailedResponse } from "@api";
import { onBeforeUnmount, onMounted, ref } from "vue";
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
/** Which patient tab an item lives in (NEO-193) — Documentos ("document") or Estudios ("study"); the API decides. */
export type ChecklistCategory = "document" | "study";
/** The patient-detail tab that shows a category's items. */
export const CHECKLIST_TAB: Record<ChecklistCategory, "documents" | "studies"> = { document: "documents", study: "studies" };

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
  /** NEO-173: someone else added it and I haven't opened it yet — the row's "Nuevo" chip. */
  is_new?: boolean;
  /** Colleagues (not me) who already opened it, first open each — "Visto por …" (NEO-173 B2). */
  opened_by?: { name: string; at: string }[];
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
  category: ChecklistCategory;
  status: ChecklistStatus;
  completed_at: string | null;
  history: ChecklistHistoryEntry[];
  pending_request_id: string | null;
  actions: { qr: boolean; fill: "questionnaire" | "sleep_study" | null; form: ClinicalRecordKind | null; print: boolean; upload: boolean };
}

export type EmailSendStatus = "sent" | "delayed" | "delivered" | "bounced" | "failed" | "suppressed" | "complained";

/** One email the app sent this patient and what Resend reported about it (NEO-190). */
export interface EmailSend {
  id: string;
  kind: "questionnaire_link" | "signed_copy";
  sent_to_masked: string;
  status: EmailSendStatus;
  status_detail: string | null;
  status_at: string | null;
  created_at: string;
  questionnaire_request_id: string | null;
}

export interface PendingRequest {
  id: string;
  items: string[];
  completed_items: string[];
  /** When the patient first opened the link; null until then (NEO-110). */
  opened_at: string | null;
  expires_at: string;
  /** Only right after creation — never stored, so it can't be re-shown later. */
  url?: string;
}

export interface RequestStatus {
  id: string;
  status: "pending" | "completed" | "cancelled" | "expired";
  items: string[];
  completed_items: string[];
  opened_at: string | null;
  expires_at: string;
}

export interface PatientChecklist {
  items: ChecklistItem[];
  other_uploads: ChecklistHistoryEntry[];
  pending_requests: PendingRequest[];
  /** The newest link when it ran out unused — the QR button's "link expired" state (NEO-93). */
  expired_request: PendingRequest | null;
  summary: { done: number; total: number };
  /** Fingerprint of the content (NEO-173) — compared with /checklist/version to know when to reload. */
  version: string;
}

/** Every entry of the checklist — item histories plus files not attached to an item. */
export function checklistEntries(checklist: PatientChecklist): ChecklistHistoryEntry[] {
  return [...checklist.items.flatMap((item) => item.history), ...checklist.other_uploads];
}

/** NEO-127: checklist items → AppSegmentProgress segments, in checklist order. */
const SEGMENT_BY_STATUS = { done: "done", pending_patient: "waiting", partial: "partial", missing: "todo" } as const;
export function checklistSegments(items: ChecklistItem[]): Array<(typeof SEGMENT_BY_STATUS)[ChecklistStatus]> {
  return items.map((item) => SEGMENT_BY_STATUS[item.status]);
}

const CHECKLIST_UPDATED = "patient-checklist-updated";
interface ChecklistUpdated {
  patientId: string;
  version: string;
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

  /**
   * One patient's checklist is on screen in up to three places at once (the
   * Estudios tab, the Details card, the side panel), each with its own copy.
   * Whichever sees a new version first tells the others, so they never show
   * different counts side by side (NEO-173).
   */
  function accept(next: PatientChecklist) {
    const changed = checklist.value?.version !== next.version;
    checklist.value = next;
    if (changed) window.dispatchEvent(new CustomEvent<ChecklistUpdated>(CHECKLIST_UPDATED, { detail: { patientId: patientId(), version: next.version } }));
  }

  async function reloadSilently(): Promise<void> {
    const res = await apiFetch(`/api/v1/patient/${patientId()}/checklist`, { handleErrors: false });
    if (res.ok) accept((await res.json()) as PatientChecklist);
  }

  function onOtherUpdated(event: Event) {
    const { patientId: id, version } = (event as CustomEvent<ChecklistUpdated>).detail;
    if (id !== patientId() || !checklist.value || checklist.value.version === version || loading.value) return;
    reloadSilently().catch((err: unknown) => reportCaught(err, { where: "usePatientChecklist.onOtherUpdated", level: "warn" }));
  }
  onMounted(() => window.addEventListener(CHECKLIST_UPDATED, onOtherUpdated));
  onBeforeUnmount(() => window.removeEventListener(CHECKLIST_UPDATED, onOtherUpdated));

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
      accept((await res.json()) as PatientChecklist);
    } catch (err) {
      reportCaught(err, { where: "usePatientChecklist.load" });
      loadFailure.value = err;
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Background check for the open tab (NEO-173): asks for the fingerprint
   * only — no health data, so no audit row every poll — and reloads the
   * checklist when it moved. Silent: no spinner, and a failed check (offline,
   * blip) keeps what's on screen and waits for the next one.
   */
  async function refreshIfChanged(): Promise<void> {
    if (loading.value) return;
    const shown = checklist.value?.version;
    try {
      const res = await apiFetch(`/api/v1/patient/${patientId()}/checklist/version`, { handleErrors: false });
      if (!res.ok) return;
      const { version } = (await res.json()) as { version: string };
      if (version === shown) return;
      await reloadSilently();
    } catch {
      // benign: offline / network blip — the next check retries, what's on screen stays
    }
  }

  /** I opened this result (NEO-173): audited server-side, and its "Nuevo" goes away for me. */
  async function markOpened(entry: ChecklistHistoryEntry): Promise<void> {
    if (!entry.is_new) return;
    entry.is_new = false; // at once — the open itself must not wait on this
    try {
      const res = await apiFetch(`/api/v1/patient/${patientId()}/checklist/entries/${entry.id}/opened`, { method: "POST", handleErrors: false });
      if (!res.ok) await reportFailedResponse(res, { where: "usePatientChecklist.markOpened" });
    } catch (err) {
      reportCaught(err, { where: "usePatientChecklist.markOpened", level: "warn" });
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

  /** Where the next email would go (masked) and what was sent before (NEO-192). */
  async function loadEmailSends(): Promise<{ recipient: string | null; sends: EmailSend[] } | null> {
    const res = await apiFetch(`/api/v1/patient/${patientId()}/email-sends`, { handleErrors: false });
    if (!res.ok) return null;
    return (await res.json()) as { recipient: string | null; sends: EmailSend[] };
  }

  /**
   * Emails the patient one personal link to the picked items (all open ones
   * when none are given). A patient without an email gets a clear "add one
   * to the record" message, not a generic failure. Returns the masked
   * address and the link (for "Copy link"), or null.
   */
  async function sendByEmail(options: { items?: string[]; copyToMe?: boolean } = {}): Promise<{ sent_to: string; url: string } | null> {
    const body = { ...(options.items ? { items: options.items } : {}), ...(options.copyToMe ? { copy_to_me: true } : {}) };
    const res = await apiFetch(`/api/v1/patient/${patientId()}/questionnaire-requests/email`, { ...json(body), handleErrors: false });
    if (res.status === 422) {
      // 422 is either "no email on the record" or "the mail server refused this address" (NEO-202).
      const { code } = (await res.clone().json().catch(() => ({}))) as { code?: string };
      const key = code === "EMAIL_REJECTED" ? "app.clinical.email.rejected" : "app.clinical.email.noEmail";
      notifications.show(t(key), "warning", undefined, { icon: "mail" });
      return null;
    }
    if (!res.ok) {
      await failWith(res, "app.clinical.email.failed", "mail", () => sendByEmail(options));
      return null;
    }
    const { sent_to, url } = (await res.json()) as { sent_to: string; url: string };
    notifications.show(t("app.clinical.email.sent", { email: sent_to }), "success", undefined, { icon: "mail" });
    await load();
    return { sent_to, url };
  }

  async function cancelRequest(requestId: string): Promise<void> {
    await send(`/questionnaire-requests/${requestId}`, { method: "DELETE" }, { icon: "qr-code", errorKey: "app.clinical.saveError", retryable: true });
  }

  /**
   * One link's status for the open QR dialog's fast check (NEO-117). Silent:
   * a failed poll just waits for the next one, never a toast every 2 s.
   */
  async function requestStatus(requestId: string): Promise<RequestStatus | null> {
    try {
      const res = await apiFetch(`/api/v1/patient/${patientId()}/questionnaire-requests/${requestId}`, { handleErrors: false });
      return res.ok ? ((await res.json()) as RequestStatus) : null;
    } catch {
      return null; // offline / network blip — the next poll retries
    }
  }

  async function upload(form: FormData): Promise<boolean> {
    const res = await send("/studies/uploads", { method: "POST", body: form }, { icon: "upload", errorKey: "app.clinical.upload.error", successKey: "app.clinical.upload.success" });
    return Boolean(res);
  }

  async function deleteUpload(attachmentId: string): Promise<void> {
    await send(`/studies/uploads/${attachmentId}`, { method: "DELETE" }, { icon: "file", errorKey: "app.clinical.upload.deleteError", successKey: "app.clinical.upload.deleted", retryable: true });
  }

  return { checklist, loading, loadError, loadFailure, load, refreshIfChanged, markOpened, recordQuestionnaire, completeBang, print, openFile, createRequest, requestStatus, sendByEmail, loadEmailSends, cancelRequest, upload, deleteUpload };
}
