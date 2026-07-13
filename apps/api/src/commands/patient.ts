import type { TenantContext } from "../context/TenantContext.js";
import {
  insertPatient,
  updatePatient,
  getPatientById,
  type PatientInsert,
  type PatientUpdate,
  type Patient,
} from "../db.js";
import { insertAuditLog } from "../db.js";
import { ValidationError } from "../errors.js";

/**
 * COMMANDS — Patient domain.
 *
 * Each command validates, writes, writes audit log, returns result.
 * No req/res. No getDb(). Only ctx.client (tenant-scoped, same transaction).
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// CREATE PATIENT
// ---------------------------------------------------------------------------

export interface CreatePatientInput {
  salutation?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  practitioner_id?: string;
  // Legacy alias: hcp_id maps to practitioner_id
  hcp_id?: string;
  diagnosis_code?: Record<string, unknown>;
  ahi_baseline?: number;
  cpap_device?: string;
  medical_record?: string;
  status?: string;
  region?: string;
  metadata?: Record<string, unknown>;
}

export async function CreatePatientCommand(
  ctx: TenantContext,
  input: CreatePatientInput
): Promise<Patient & { name: string }> {
  const firstName = input.first_name?.trim() ?? "";
  const lastName  = input.last_name?.trim() ?? "";
  if (!firstName) throw new ValidationError("first_name is required");
  if (!lastName)  throw new ValidationError("last_name is required");

  const email = input.email?.trim();
  if (email && !EMAIL_REGEX.test(email)) throw new ValidationError("Invalid email format");

  // Support legacy hcp_id → practitioner_id
  const practitionerId = input.practitioner_id?.trim() || input.hcp_id?.trim() || undefined;

  const insertInput: PatientInsert = {
    salutation:     input.salutation?.trim() || undefined,
    first_name:     firstName,
    last_name:      lastName,
    email:          email || undefined,
    phone:          input.phone?.trim() || undefined,
    practitioner_id: practitionerId,
    diagnosis_code: input.diagnosis_code,
    ahi_baseline:   input.ahi_baseline,
    cpap_device:    input.cpap_device?.trim() || undefined,
    medical_record: input.medical_record?.trim() || undefined,
    status:         input.status || "active",
    region:         input.region || "",
    metadata:       input.metadata,
  };

  const patient = await insertPatient(ctx.client, insertInput);

  await insertAuditLog(ctx.client, {
    user_id:      ctx.user.id,
    action:       "create",
    entity_type:  "Patient",
    entity_id:    patient.id,
    entity_after: { id: patient.id, status: patient.status, region: patient.region },
    request_id:   ctx.requestId,
  });

  return patient;
}

// ---------------------------------------------------------------------------
// UPDATE PATIENT
// ---------------------------------------------------------------------------

export interface UpdatePatientPayload {
  salutation?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  practitioner_id?: string;
  hcp_id?: string;
  diagnosis_code?: Record<string, unknown>;
  ahi_baseline?: number;
  cpap_device?: string;
  medical_record?: string;
  status?: string;
  region?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Updates a Patient. Returns null if not found.
 */
export async function UpdatePatientCommand(
  ctx: TenantContext,
  id: string,
  input: UpdatePatientPayload
): Promise<(Patient & { name: string }) | null> {
  if (!id?.trim()) throw new ValidationError("patient id is required");

  const email = input.email?.trim();
  if (email && !EMAIL_REGEX.test(email)) throw new ValidationError("Invalid email format");

  const before = await getPatientById(ctx.client, id);
  if (!before) return null;

  // Support legacy hcp_id → practitioner_id
  const practitionerId = input.practitioner_id !== undefined
    ? input.practitioner_id
    : input.hcp_id !== undefined
      ? input.hcp_id
      : undefined;

  const updateInput: PatientUpdate = {
    salutation:     input.salutation !== undefined ? (input.salutation || undefined) : undefined,
    first_name:     input.first_name?.trim() || undefined,
    last_name:      input.last_name?.trim() || undefined,
    email:          input.email !== undefined ? input.email : undefined,
    phone:          input.phone !== undefined ? input.phone : undefined,
    practitioner_id: practitionerId,
    diagnosis_code: input.diagnosis_code,
    ahi_baseline:   input.ahi_baseline,
    cpap_device:    input.cpap_device !== undefined ? input.cpap_device : undefined,
    medical_record: input.medical_record !== undefined ? input.medical_record : undefined,
    status:         input.status,
    region:         input.region,
    metadata:       input.metadata,
  };

  const after = await updatePatient(ctx.client, id, updateInput);
  if (!after) return null;

  await insertAuditLog(ctx.client, {
    user_id:       ctx.user.id,
    action:        "update",
    entity_type:   "Patient",
    entity_id:     id,
    entity_before: { status: before.status, region: before.region },
    entity_after:  { status: after.status,  region: after.region },
    request_id:    ctx.requestId,
  });

  return after;
}
