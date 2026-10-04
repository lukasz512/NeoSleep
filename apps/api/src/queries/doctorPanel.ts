import type { TenantContext } from "../context/TenantContext.js";
import { DOCUMENT_MANIFEST } from "@neo/documents";
import { isDoctorPanelEnabled } from "../db/config.js";
import { listDoctorActions, type DoctorActionItem } from "../db/doctorPanel.js";
import { listPatientChecklistConfig } from "../db/documentTemplateEntityType.js";
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
