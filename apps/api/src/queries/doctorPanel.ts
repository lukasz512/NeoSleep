import type { TenantContext } from "../context/TenantContext.js";
import { DOCUMENT_MANIFEST } from "@neo/documents";
import { isDoctorPanelEnabled } from "../db/config.js";
import {
  listDoctorActions,
  listDoctorPanelPatients,
  DOCTOR_PATIENT_STAGES,
  type DoctorActionItem,
  type DoctorPatientStage,
} from "../db/doctorPanel.js";
import { listPatientChecklistConfig } from "../db/documentTemplateEntityType.js";
import { getPatientFormStatus } from "../db/patientFormCompletion.js";
import { getPatientIntakeForms } from "./patient.js";
import { getViewer } from "./entityAccess.js";

/**
 * QUERY — Doctor Panel "Needs your action" (NEO-233, docs/stories/doctor-panel-today-and-actions.md).
 * Doctor only (the route enforces the role); the viewer's practitioner id is the only scope,
 * so another doctor's or an unassigned patient can never appear. Read-only.
 */

export interface DoctorActionsDto {
  /** The per-tenant switch (db/config.ts); when off the PWA shows no tiles at all. */
  enabled: boolean;
  items: DoctorActionItem[];
}

/** Consent-mode checklist documents, same selection as the patient checklist (queries/patientChecklist.ts). */
async function consentKeys(ctx: TenantContext): Promise<string[]> {
  const config = await listPatientChecklistConfig(ctx.client);
  return config
    .filter((c) => c.fill_mode === "consent" && DOCUMENT_MANIFEST.some((m) => m.templateKey === c.template_key && !m.hidden))
    .map((c) => c.template_key);
}

export async function GetDoctorActionsQuery(ctx: TenantContext): Promise<DoctorActionsDto> {
  if (!(await isDoctorPanelEnabled())) return { enabled: false, items: [] };
  const viewer = await getViewer(ctx);
  const items = await listDoctorActions(ctx.client, viewer.practitionerId!, await consentKeys(ctx));
  return { enabled: true, items };
}

/** "Por completar" (D3): beyond the checklist — without a phone the patient can't confirm a visit. */
export const CONTACT_KEYS = ["phone", "email"] as const;

export interface DoctorPanelIncomplete {
  patient_id: string;
  patient_name: string | null;
  /** Checklist template keys (same rule as the patient list's dots) and/or "phone" / "email". */
  missing: string[];
  done: number;
  total: number;
}

export interface DoctorPanelSummaryDto {
  enabled: boolean;
  /** Active (non-discharged) own patients per stage; their sum is the donut's centre number. */
  stages: Record<DoctorPatientStage, number>;
  /** Patients with at least one missing item, the least complete first. */
  incomplete: DoctorPanelIncomplete[];
}

const emptyStages = (): Record<DoctorPatientStage, number> =>
  Object.fromEntries(DOCTOR_PATIENT_STAGES.map((s) => [s, 0])) as Record<DoctorPatientStage, number>;

export async function GetDoctorPanelSummaryQuery(ctx: TenantContext): Promise<DoctorPanelSummaryDto> {
  if (!(await isDoctorPanelEnabled())) return { enabled: false, stages: emptyStages(), incomplete: [] };
  const viewer = await getViewer(ctx);
  const patients = await listDoctorPanelPatients(ctx.client, viewer.practitionerId!);
  const forms = await getPatientIntakeForms();
  const status = await getPatientFormStatus(ctx.client, patients.map((p) => p.id), forms);

  const stages = emptyStages();
  const incomplete: DoctorPanelIncomplete[] = [];
  const total = forms.length + CONTACT_KEYS.length;
  for (const p of patients) {
    stages[p.stage] += 1;
    const done = status.get(p.id)?.done ?? new Set<string>();
    const missing = [
      ...forms.filter((f) => !done.has(f.key)).map((f) => f.key),
      ...(p.has_phone ? [] : ["phone"]),
      ...(p.has_email ? [] : ["email"]),
    ];
    if (missing.length) incomplete.push({ patient_id: p.id, patient_name: p.name, missing, done: total - missing.length, total });
  }
  incomplete.sort((a, b) => a.done / a.total - b.done / b.total);
  return { enabled: true, stages, incomplete };
}
