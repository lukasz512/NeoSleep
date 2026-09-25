import type { TenantContext } from "../context/TenantContext.js";
import {
  getPatientsPaginated,
  getPatientById,
  getTerritoryPath,
  type GetPatientsFilters,
  type Patient,
  type TerritoryPathNode,
} from "../db.js";
import { withPlatform } from "../db/tenant.js";
import { getTemplateKeysForEntityType } from "../db/documentTemplateEntityType.js";
import { getPatientFormCompletion, POLYSOMNOGRAPHY_FORM_KEY } from "../db/patientFormCompletion.js";
import { DOCUMENT_MANIFEST } from "@neo/documents";
import { getAllowedScopePaths, assertTerritoryAccessByTerritoryId } from "../middleware/requireScope.js";

/**
 * QUERIES — Patient domain.
 *
 * Read-only. No writes, no events, no audit log.
 */

// ---------------------------------------------------------------------------
// SERIALIZATION
// ---------------------------------------------------------------------------

export interface PatientDto {
  id: string;
  name: string;
  salutation: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  /** male | female | other | prefer_not_to_say | null — the list shows F/M + age (NEO-57) */
  gender: string | null;
  /** YYYY-MM-DD or null */
  date_of_birth: string | null;
  practitioner_id: string | null;
  practitioner_name: string | null;
  /** Doctor's specialty lookup key, labelled via lookups on the client */
  practitioner_specialty: string | null;
  diagnosis_code: Record<string, unknown> | null;
  ahi_baseline: number | null;
  cpap_device: string | null;
  medical_record: string | null;
  region: string;
  territory_id: string | null;
  territory_name: string | null;
  /** Root-first breadcrumb ("mx"/"cdmx"/"polanco") — only populated on the
   *  single-record GetPatientByIdQuery (one extra query, fine for a detail
   *  view); the paginated list query omits it to avoid N+1. Null when
   *  territory_id is unset or points at a deleted/unknown node — the
   *  frontend falls back to the flat `region` text in that case. */
  territory_path: TerritoryPathNode[] | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** One entry per document template assigned to patients, in DOCUMENT_MANIFEST order (NEO-54). */
export interface PatientIntakeFormStatus {
  key: string;
  done: boolean;
}

export type PatientListItemDto = PatientDto & { intake_forms: PatientIntakeFormStatus[] };

function toDto(p: Patient & { name: string }, territoryPath: TerritoryPathNode[] | null = null): PatientDto {
  return {
    id:              p.id,
    name:            p.name,
    salutation:      p.salutation ?? null,
    first_name:      p.first_name,
    last_name:       p.last_name,
    email:           p.email ?? null,
    phone:           p.phone ?? null,
    gender:          p.gender ?? null,
    date_of_birth:   p.date_of_birth ?? null,
    practitioner_id: p.practitioner_id ?? null,
    practitioner_name: p.practitioner_name ?? null,
    practitioner_specialty: p.practitioner_specialty ?? null,
    diagnosis_code:  p.diagnosis_code ?? null,
    ahi_baseline:    p.ahi_baseline ?? null,
    cpap_device:     p.cpap_device ?? null,
    medical_record:  p.medical_record ?? null,
    region:          p.region,
    territory_id:    p.territory_id ?? null,
    territory_name:  p.territory_name ?? null,
    territory_path:  territoryPath && territoryPath.length > 0 ? territoryPath : null,
    status:          p.status,
    metadata:        p.metadata ?? null,
    created_at:      p.created_at,
    updated_at:      p.updated_at,
  };
}

// ---------------------------------------------------------------------------
// QUERY: GET LIST
// ---------------------------------------------------------------------------

export interface GetPatientListInput {
  search?: string;
  status?: string;
  region?: string;
  practitioner_id?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GetPatientListResult {
  items: PatientListItemDto[];
  total: number;
}

export async function GetPatientListQuery(
  ctx: TenantContext,
  input: GetPatientListInput
): Promise<GetPatientListResult> {
  const filters: GetPatientsFilters = {
    search: input.search,
    status: input.status,
    region: input.region,
    practitioner_id: input.practitioner_id,
    scopePaths: await getAllowedScopePaths(ctx.client, ctx.user.roles),
  };

  const page      = input.page ?? 1;
  const limit     = input.limit ?? 50;
  const sortBy    = input.sortBy ?? "created_at";
  const sortOrder = input.sortOrder ?? "desc";

  const { rows, total } = await getPatientsPaginated(ctx.client, filters, page, limit, sortBy, sortOrder);

  const formKeys = await getPatientIntakeFormKeys();
  const completion = await getPatientFormCompletion(ctx.client, rows.map((row) => row.id), formKeys);
  const items = rows.map((row) => {
    const done = completion.get(row.id);
    return {
      ...toDto(row),
      intake_forms: formKeys.map((key) => ({ key, done: done?.has(key) ?? false })),
    };
  });
  return { items, total };
}

/**
 * Templates an admin assigned to "patient" (Documents → Permissions tab),
 * ordered by DOCUMENT_MANIFEST so the icons and tooltip list always come out
 * in the same order, then polysomnography, which every patient always has.
 * Hidden (test-fixture) and unknown keys are dropped.
 */
async function getPatientIntakeFormKeys(): Promise<string[]> {
  const assigned = new Set(await withPlatform((client) => getTemplateKeysForEntityType(client, "patient")));
  const templateKeys = DOCUMENT_MANIFEST.filter((entry) => !entry.hidden && assigned.has(entry.templateKey)).map((entry) => entry.templateKey);
  return [...templateKeys, POLYSOMNOGRAPHY_FORM_KEY];
}

// ---------------------------------------------------------------------------
// QUERY: GET BY ID
// ---------------------------------------------------------------------------

export async function GetPatientByIdQuery(
  ctx: TenantContext,
  id: string
): Promise<PatientDto | null> {
  const patient = await getPatientById(ctx.client, id);
  if (!patient) return null;
  await assertTerritoryAccessByTerritoryId(ctx, patient.territory_id);
  const territoryPath = patient.territory_id ? await getTerritoryPath(ctx.client, patient.territory_id) : null;
  return toDto(patient, territoryPath);
}
