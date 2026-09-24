import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { apiFetch, extractErrorMessage } from "./useApi";
import { useNotifications } from "./useNotifications";
import type { ClinicalRecordKind, PatientFillableKind } from "../config/questionnaires";

/**
 * Clinical questionnaires (Estudios) for one patient — API:
 * /api/v1/patient/:id/clinical-records and /questionnaire-requests
 * (migration 030, ADR-023). Replaces useEndoIntake.ts.
 *
 * Every call passes handleErrors:false and shows the server's own message
 * (falling back to a translated one): the global handler plus a
 * component toast used to show two error toasts for one failure, and the
 * server message is the one that says what actually went wrong (NEO-36's
 * "Database error: withTenant" hid a Chromium launch failure).
 */

export interface ClinicalRecord {
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

export interface QuestionnaireRequest {
  id: string;
  kind: PatientFillableKind;
  expires_at: string;
  status: "pending" | "completed" | "cancelled" | "expired";
  /** Only present right after creation — never stored, so it can't be re-shown later. */
  url?: string;
}

export function useClinicalRecords(patientId: () => string) {
  const { t } = useI18n();
  const notifications = useNotifications();

  const records = ref<ClinicalRecord[]>([]);
  const pendingRequests = ref<QuestionnaireRequest[]>([]);
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
      const res = await apiFetch(`/api/v1/patient/${patientId()}/clinical-records`, { handleErrors: false });
      if (!res.ok) {
        loadError.value = true;
        return;
      }
      const data = (await res.json()) as { records: ClinicalRecord[]; pending_requests: QuestionnaireRequest[] };
      records.value = data.records;
      pendingRequests.value = data.pending_requests;
    } catch {
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function record(kind: ClinicalRecordKind, answers: Record<string, unknown>): Promise<boolean> {
    const res = await apiFetch(`/api/v1/patient/${patientId()}/clinical-records/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers),
      handleErrors: false,
    });
    if (!res.ok) {
      await failWith(res, "app.clinical.saveError");
      return false;
    }
    notifications.show(t("app.clinical.saveSuccess"), "success");
    await load();
    return true;
  }

  async function completeBang(recordId: string, answers: Record<string, unknown>): Promise<boolean> {
    const res = await apiFetch(`/api/v1/patient/${patientId()}/clinical-records/stop_bang/${recordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers),
      handleErrors: false,
    });
    if (!res.ok) {
      await failWith(res, "app.clinical.saveError");
      return false;
    }
    notifications.show(t("app.clinical.saveSuccess"), "success");
    await load();
    return true;
  }

  /** Generates, stores (patient Documents tab) and opens the PDF in a new tab. */
  async function generatePdf(kind: ClinicalRecordKind, recordId: string): Promise<void> {
    // Opened synchronously, inside the click handler, so popup blockers
    // (Safari especially) allow it; pointed at the signed URL once ready.
    const tab = window.open("", "_blank");
    // What "noopener" would do — passing it would make window.open return null.
    if (tab) tab.opener = null;
    const res = await apiFetch(`/api/v1/patient/${patientId()}/clinical-records/${kind}/${recordId}/pdf`, {
      method: "POST",
      handleErrors: false,
    });
    if (!res.ok) {
      tab?.close();
      await failWith(res, "app.clinical.generatePdfError");
      return;
    }
    const { url } = (await res.json()) as { url: string };
    if (tab) tab.location.href = url;
    else window.open(url, "_blank", "noopener");
  }

  async function createRequest(kind: PatientFillableKind): Promise<QuestionnaireRequest | null> {
    const res = await apiFetch(`/api/v1/patient/${patientId()}/questionnaire-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
      handleErrors: false,
    });
    if (!res.ok) {
      await failWith(res, "app.clinical.qr.createError");
      return null;
    }
    const created = (await res.json()) as QuestionnaireRequest;
    await load();
    return created;
  }

  async function cancelRequest(requestId: string): Promise<void> {
    const res = await apiFetch(`/api/v1/patient/${patientId()}/questionnaire-requests/${requestId}`, {
      method: "DELETE",
      handleErrors: false,
    });
    if (!res.ok) await failWith(res, "app.clinical.saveError");
    await load();
  }

  return { records, pendingRequests, loading, loadError, load, record, completeBang, generatePdf, createRequest, cancelRequest };
}
