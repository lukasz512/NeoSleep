import { createHash } from "node:crypto";
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
import { listPendingQuestionnaireRequestsForPatient, getLatestExpiredQuestionnaireRequestForPatient, type QuestionnaireRequest } from "../db/questionnaireRequest.js";
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
  /** users.id of the staff member who added it (null: the patient, or unknown) — decides "Nuevo" (NEO-173). */
  created_by: string | null;
  /** When it was entered, where created_at is a clinical date instead (a sleep study's study_date). */
  added_at?: Date;
  /** NEO-173: added by someone else since NEW_MARKER_SINCE and not yet opened by the viewing user — set by annotateNewEntries(). */
  is_new?: boolean;
  /** Clinical form record (for view / PDF), when type = "record". */
  record?: (MedicalHistoryRecord | OralExamRecord | StopBangRecord) & { kind: ClinicalRecordKind };
  /** Stored file (signed consent PDF, uploaded study) — downloadable via the patient documents endpoint. */
  file_attachment_id?: string | null;
  title?: string | null;
  notes?: string | null;
  filename?: string | null;
  /** A file attached directly to a sleep study (the pre-checklist "Subir PDF") — downloaded via the sleep-study attachment endpoint. */
  sleep_study_id?: string | null;
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
  /** The patient's newest link when it ran out unused — the QR button's "link expired" state (NEO-93). */
  expired_request: QuestionnaireRequest | null;
  summary: { done: number; total: number };
}

const GROUP_FOR: Record<ChecklistFillMode, ChecklistGroup> = {
  consent: "consent",
  patient: "patient",
  doctor: "doctor",
  external: "results",
};
const GROUP_ORDER: ChecklistGroup[] = ["consent", "patient", "doctor", "results"];
/** PSG counts once a polysomnography's RESULTS are in — not when merely ordered or recorded (same rule as db/patientFormCompletion.ts, NEO-54). */
const PSG_DONE_STATUSES = new Set(["results_received", "interpreted"]);

function uploadEntry(file: FileAttachment): ChecklistHistoryEntry {
  const meta = file.metadata ?? {};
  return {
    id: file.id,
    type: "upload",
    created_at: file.created_at,
    source: "staff",
    by: typeof meta.uploaded_by_name === "string" ? meta.uploaded_by_name : null,
    created_by: file.uploaded_by,
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
  const expired = pending.length ? null : await getLatestExpiredQuestionnaireRequestForPatient(client, patientId);
  const sleepStudyFiles: Array<FileAttachment & { sleep_study_id: string }> = [];
  for (const study of sleepStudies) {
    for (const file of await getFileAttachmentsForEntity(client, "sleep_study", study.id)) sleepStudyFiles.push({ ...file, sleep_study_id: study.id });
  }
  return { histories, exams, screenings, consents, files, sleepStudies, pending, expired, sleepStudyFiles };
}

export async function GetPatientChecklistQuery(ctx: TenantContext, patientId: string): Promise<PatientChecklist> {
  const patient = await GetPatientByIdQuery(ctx, patientId);
  if (!patient) throw new NotFoundError("Patient", patientId);

  const config = await withPlatform((client) => listPatientChecklistConfig(client));
  const src = await loadSources(ctx.client, patientId);
  const sleepStudyCreators = await getCreatorsFromAudit(ctx.client, "SleepStudy", src.sleepStudies.map((s) => s.id));

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
      created_by: r.recorded_by,
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
              created_by: consent.collected_by,
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
      created_by: sleepStudyCreators.get(s.id) ?? null,
      added_at: new Date(s.created_at),
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
    ...src.sleepStudyFiles.map((file) => ({ ...uploadEntry(file), title: file.filename, file_attachment_id: file.id, sleep_study_id: file.sleep_study_id })),
  ].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  const psgDoneStudies = new Set(
    src.sleepStudies.filter((s) => s.study_type === "polysomnography" && PSG_DONE_STATUSES.has(s.status)).map((s) => s.id)
  );
  const psgDone = psgHistory.find((h) => h.type === "upload" || (h.sleep_study != null && psgDoneStudies.has(h.sleep_study.id)));
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
    expired_request: src.expired,
    summary: { done: items.filter((i) => i.status === "done").length, total: items.length },
  };
}

// ---------------------------------------------------------------------------
// NEO-173 — "Nuevo" marker + change detection for the open Estudios tab
// ---------------------------------------------------------------------------

/**
 * Results entered before this never count as new — without it every result
 * already in the system would light up for every user on rollout day.
 */
export const NEW_MARKER_SINCE = new Date("2026-09-28T00:00:00Z");

/** audit_log entity_type of the "this user opened this Estudios result" read row. */
export const CHECKLIST_ENTRY_AUDIT_TYPE = "ChecklistEntry";

/** sleep_study has no created_by column — its create command's audit row says who added it. */
async function getCreatorsFromAudit(client: PoolClient, entityType: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const r = await client.query<{ entity_id: string; user_id: string }>(
    `SELECT DISTINCT ON (entity_id) entity_id, user_id FROM audit_log
      WHERE entity_type = $1 AND action = 'create' AND entity_id = ANY($2::text[]) AND user_id IS NOT NULL
      ORDER BY entity_id, created_at`,
    [entityType, ids]
  );
  return new Map(r.rows.map((row) => [row.entity_id, row.user_id]));
}

export function allChecklistEntries(checklist: PatientChecklist): ChecklistHistoryEntry[] {
  return [...checklist.items.flatMap((item) => item.history), ...checklist.other_uploads];
}

/**
 * Per viewing user: an entry is new when someone else added it (the patient
 * via QR, or another staff member) after NEW_MARKER_SINCE, and this user has
 * not opened it yet — no audit_log read row of theirs for it (written by
 * OpenChecklistEntryCommand). Sets is_new on every entry.
 */
export async function annotateNewEntries(client: PoolClient, checklist: PatientChecklist, userId: string): Promise<PatientChecklist> {
  const entries = allChecklistEntries(checklist);
  const candidates = entries.filter((e) => e.created_by !== userId && (e.added_at ?? e.created_at) >= NEW_MARKER_SINCE);
  const opened = new Set<string>();
  if (candidates.length) {
    const r = await client.query<{ entity_id: string }>(
      `SELECT DISTINCT entity_id FROM audit_log
        WHERE entity_type = $1 AND action = 'read' AND user_id = $2 AND entity_id = ANY($3::text[])`,
      [CHECKLIST_ENTRY_AUDIT_TYPE, userId, candidates.map((e) => e.id)]
    );
    for (const row of r.rows) opened.add(row.entity_id);
  }
  const fresh = new Set(candidates.filter((e) => !opened.has(e.id)).map((e) => e.id));
  for (const entry of entries) entry.is_new = fresh.has(entry.id);
  return checklist;
}

/**
 * A fingerprint of everything the Estudios tab shows (NEO-173). The open tab
 * polls it and reloads the full checklist — an audited health-data read —
 * only when it changed; the fingerprint itself carries no health data.
 * Taken before annotateNewEntries, so one user opening a result does not
 * change it for everyone else.
 */
export function checklistVersion(checklist: PatientChecklist): string {
  return createHash("sha256").update(JSON.stringify(checklist)).digest("hex").slice(0, 32);
}
