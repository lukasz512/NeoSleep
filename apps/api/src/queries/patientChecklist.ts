import type { PoolClient } from "pg";
import type { TenantContext } from "../context/TenantContext.js";
import { DOCUMENT_MANIFEST } from "@neo/documents";
import { withPlatform } from "../db/tenant.js";
import { listPatientChecklistConfig, type ChecklistFillMode } from "../db/documentTemplateEntityType.js";
import {
  listMedicalHistoryForPatient,
  listOralExamsForPatient,
  listStopBangForPatient,
  type MedicalHistoryRecord,
  type OralExamRecord,
  type StopBangRecord,
} from "../db/clinicalRecords.js";
import { listConsentsForEntity } from "../db/consent.js";
import { getFileAttachmentsForEntity, type FileAttachment } from "../db/fileAttachment.js";
import { getSleepStudiesPaginated, type SleepStudy } from "../db/sleepStudy.js";
import { listPendingQuestionnaireRequestsForPatient, type QuestionnaireRequest } from "../db/questionnaireRequest.js";
import { GetPatientByIdQuery } from "./patient.js";
import { NotFoundError } from "../errors.js";
import type { ClinicalRecordKind } from "../commands/clinicalRecordFields.js";

/**
 * QUERY — the patient's Estudios checklist (NEO-36 part 2, ADR-024).
 *
 * Items = every document assigned to patients in the Documents admin
 * (platform.document_template_entity_type, ordered by its sort_order and
 * grouped by fill_mode) + polysomnography, a built-in item that is always
 * last. Each item's status comes from its binding:
 *   - templates with a clinical form (medicalHistory / stopBang / oralExam)
 *     → the migration-030 record tables (append-only; latest decides)
 *   - fill_mode "consent" → a non-withdrawn consent row (signed on the phone)
 *   - polysomnography → the patient's sleep studies
 *   - any item → a file the doctor attached to it ("Agregar estudio" →
 *     "attach to…"), e.g. a signed paper consent or an external PSG report
 * Files uploaded without an item become their own "other" entries.
 */

export const POLYSOMNOGRAPHY_KEY = "polysomnography";

/** Templates whose content is a structured clinical form (migration 030) — the rest are print/sign/upload only. */
export const FORM_BINDINGS: Record<string, ClinicalRecordKind> = {
  medicalHistory: "medical_history",
  stopBang: "stop_bang",
  oralExam: "oral_exam",
};

/** Which items a patient can complete on their phone from a QR link. */
export function isPatientCompletable(key: string, fillMode: ChecklistFillMode): boolean {
  return fillMode === "consent" || key === "medicalHistory" || key === "stopBang";
}

export type ChecklistGroup = "consent" | "patient" | "doctor" | "results";
export type ChecklistStatus = "missing" | "pending_patient" | "partial" | "done";

export interface ChecklistHistoryEntry {
  id: string;
  type: "record" | "consent" | "upload" | "sleep_study";
  created_at: Date;
  source: "staff" | "patient";
  by: string | null;
  /** Clinical form record (for view / PDF), when type = "record". */
  record?: (MedicalHistoryRecord | OralExamRecord | StopBangRecord) & { kind: ClinicalRecordKind };
  /** Stored file (signed consent PDF, uploaded study) — downloadable via the patient documents endpoint. */
  file_attachment_id?: string | null;
  title?: string | null;
  notes?: string | null;
  filename?: string | null;
  sleep_study?: Pick<SleepStudy, "id" | "status" | "study_date" | "ahi_score" | "spo2_nadir" | "odi" | "interpretation">;
}

export interface ChecklistItem {
  key: string;
  templateKey: string | null;
  /** Admin-facing manifest label — the UI prefers its own i18n title for known keys. */
  label: string;
  fillMode: ChecklistFillMode;
  group: ChecklistGroup;
  status: ChecklistStatus;
  completed_at: Date | null;
  history: ChecklistHistoryEntry[];
  pending_request_id: string | null;
  actions: {
    qr: boolean;
    fill: "questionnaire" | "sleep_study" | null;
    form: ClinicalRecordKind | null;
    print: boolean;
    upload: boolean;
  };
}

export interface PatientChecklist {
  items: ChecklistItem[];
  /** Files uploaded without being attached to an item. */
  other_uploads: ChecklistHistoryEntry[];
  pending_requests: QuestionnaireRequest[];
  summary: { done: number; total: number };
}

const GROUP_FOR: Record<ChecklistFillMode, ChecklistGroup> = {
  consent: "consent",
  patient: "patient",
  doctor: "doctor",
  external: "results",
};
const GROUP_ORDER: ChecklistGroup[] = ["consent", "patient", "doctor", "results"];
const PSG_DONE_STATUSES = new Set(["study_complete", "results_received", "interpreted"]);

function uploadEntry(file: FileAttachment): ChecklistHistoryEntry {
  const meta = file.metadata ?? {};
  return {
    id: file.id,
    type: "upload",
    created_at: file.created_at,
    source: "staff",
    by: typeof meta.uploaded_by_name === "string" ? meta.uploaded_by_name : null,
    file_attachment_id: file.id,
    title: typeof meta.title === "string" ? meta.title : null,
    notes: typeof meta.notes === "string" ? meta.notes : null,
    filename: file.filename,
  };
}

async function loadSources(client: PoolClient, patientId: string) {
  const histories = await listMedicalHistoryForPatient(client, patientId);
  const exams = await listOralExamsForPatient(client, patientId);
  const screenings = await listStopBangForPatient(client, patientId);
  const consents = await listConsentsForEntity(client, "patient", patientId);
  const files = await getFileAttachmentsForEntity(client, "patient", patientId);
  const { rows: sleepStudies } = await getSleepStudiesPaginated(client, { patient_id: patientId }, 1, 500, "created_at", "desc");
  const pending = await listPendingQuestionnaireRequestsForPatient(client, patientId);
  return { histories, exams, screenings, consents, files, sleepStudies, pending };
}

export async function GetPatientChecklistQuery(ctx: TenantContext, patientId: string): Promise<PatientChecklist> {
  const patient = await GetPatientByIdQuery(ctx, patientId);
  if (!patient) throw new NotFoundError("Patient", patientId);

  const config = await withPlatform((client) => listPatientChecklistConfig(client));
  const src = await loadSources(ctx.client, patientId);

  const uploads = src.files.filter((f) => f.metadata?.document_type === "study_upload");
  const uploadsFor = (key: string) => uploads.filter((f) => f.metadata?.checklist_item === key).map(uploadEntry);
  const signedConsentFile = (fileId: unknown) => src.files.find((f) => f.id === fileId) ?? null;

  const recordsFor = (kind: ClinicalRecordKind): ChecklistHistoryEntry[] => {
    const rows: Array<(MedicalHistoryRecord | OralExamRecord | StopBangRecord)> =
      kind === "medical_history" ? src.histories : kind === "oral_exam" ? src.exams : src.screenings;
    return rows.map((r) => ({
      id: r.id,
      type: "record" as const,
      created_at: r.created_at,
      source: "source" in r ? r.source : "staff",
      by: r.recorded_by_name,
      record: { ...r, kind },
    }));
  };

  const pendingFor = (key: string) =>
    src.pending.find((request) => request.items.includes(key) && !request.completed_items.includes(key)) ?? null;

  const items: ChecklistItem[] = config
    .filter((c) => DOCUMENT_MANIFEST.some((m) => m.templateKey === c.template_key && !m.hidden))
    .map((c) => {
      const key = c.template_key;
      const fillMode: ChecklistFillMode = c.fill_mode ?? "doctor";
      const form = FORM_BINDINGS[key] ?? null;

      let history: ChecklistHistoryEntry[] = [];
      if (form) history = recordsFor(form);
      if (fillMode === "consent") {
        history = src.consents
          .filter((consent) => consent.purpose === key && !consent.withdrawn_at)
          .map((consent) => {
            const file = signedConsentFile(consent.metadata?.file_attachment_id);
            return {
              id: consent.id,
              type: "consent" as const,
              created_at: consent.granted_at,
              source: consent.collected_by ? ("staff" as const) : ("patient" as const),
              by: null,
              file_attachment_id: file?.id ?? null,
              filename: file?.filename ?? null,
            };
          });
      }
      history = [...history, ...uploadsFor(key)].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

      const latest = history[0];
      let status: ChecklistStatus = "missing";
      if (latest) {
        status = latest.record?.kind === "stop_bang" && (latest.record as StopBangRecord).score === null ? "partial" : "done";
      }
      const pending = pendingFor(key);
      if (status === "missing" && pending) status = "pending_patient";

      return {
        key,
        templateKey: key,
        label: DOCUMENT_MANIFEST.find((m) => m.templateKey === key)?.label ?? key,
        fillMode,
        group: GROUP_FOR[fillMode],
        status,
        completed_at: status === "done" && latest ? latest.created_at : null,
        history,
        pending_request_id: pending?.id ?? null,
        actions: {
          qr: isPatientCompletable(key, fillMode),
          fill: form ? "questionnaire" : null,
          form,
          print: fillMode !== "external",
          upload: true,
        },
      };
    });

  // Built-in, always last: the sleep study (polysomnography) — lab/device result.
  const psgHistory: ChecklistHistoryEntry[] = [
    ...src.sleepStudies.map((s) => ({
      id: s.id,
      type: "sleep_study" as const,
      created_at: new Date(s.study_date ?? s.created_at),
      source: "staff" as const,
      by: null,
      sleep_study: {
        id: s.id,
        status: s.status,
        study_date: s.study_date,
        ahi_score: s.ahi_score,
        spo2_nadir: s.spo2_nadir,
        odi: s.odi,
        interpretation: s.interpretation,
      },
    })),
    ...uploadsFor(POLYSOMNOGRAPHY_KEY),
  ].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  const psgDone = psgHistory.find((h) => h.type === "upload" || PSG_DONE_STATUSES.has(h.sleep_study?.status ?? ""));
  items.push({
    key: POLYSOMNOGRAPHY_KEY,
    templateKey: null,
    label: "Polysomnography",
    fillMode: "external",
    group: "results",
    status: psgDone ? "done" : psgHistory.length ? "partial" : "missing",
    completed_at: psgDone?.created_at ?? null,
    history: psgHistory,
    pending_request_id: null,
    actions: { qr: false, fill: "sleep_study", form: null, print: false, upload: true },
  });

  items.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  // (Array.prototype.sort is stable: within a group the admin's sort_order from the config query holds.)

  const knownKeys = new Set(items.map((i) => i.key));
  const otherUploads = uploads
    .filter((f) => typeof f.metadata?.checklist_item !== "string" || !knownKeys.has(f.metadata.checklist_item as string))
    .map(uploadEntry);

  return {
    items,
    other_uploads: otherUploads,
    pending_requests: src.pending,
    summary: { done: items.filter((i) => i.status === "done").length, total: items.length },
  };
}
