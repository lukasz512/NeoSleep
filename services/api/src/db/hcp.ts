import { getDb } from "./connection.js";
import { toArray, trimOrNull, trimOrEmpty } from "./helpers.js";
import { AppError, DatabaseError, ValidationError } from "../errors.js";

export interface HCP {
  id: string;
  institution: string | null;
  title: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact: string | null;
  preferred_time: string | null;
  primary_specialty: string | null;
  secondary_specialty: string | null;
  role: string | null;
  license_number: string | null;
  years_experience: number | null;
  is_key_opinion_leader: boolean;
  influence_tier: string;
  prescribing_volume: string | null;
  engagement_level: string;
  contact_frequency: string | null;
  first_contact_date: Date | null;
  visit_count: number;
  last_visit_date: Date | null;
  language: string | null;
  region: string;
  status: string;
  data_consent_at: Date | null;
  data_consent_withdrawn_at: Date | null;
  notes: string | null;
  tags: string[];
  hco_id: string | null;
  primary_hco_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface GetHCPFilters {
  search?: string;
  specialty?: string | string[];
  institution?: string | string[];
  region?: string | string[];
}

export interface InsertHCPInput {
  first_name: string;
  last_name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  primary_specialty?: string | null;
  institution?: string | null;
  region?: string;
  lead_id?: string | null;
  influence_tier?: string;
  engagement_level?: string;
  prescribing_volume?: string | null;
  preferred_contact?: string | null;
  preferred_time?: string | null;
  language?: string | null;
  notes?: string | null;
  tags?: string[];
}

export interface UpdateHCPInput {
  first_name?: string;
  last_name?: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  primary_specialty?: string | null;
  institution?: string | null;
  region?: string;
  influence_tier?: string;
  engagement_level?: string;
  prescribing_volume?: string | null;
  preferred_contact?: string | null;
  preferred_time?: string | null;
  language?: string | null;
  notes?: string | null;
  tags?: string[];
}

const HCP_SORT_COLUMNS = ["first_name", "last_name", "email", "primary_specialty", "region", "influence_tier", "engagement_level", "created_at"] as const;

const HCP_SELECT_COLS = `
  h.id, h.title, h.first_name, h.last_name, h.email, h.phone,
  h.primary_specialty, h.secondary_specialty, h.role, h.license_number, h.years_experience,
  h.is_key_opinion_leader, h.influence_tier, h.prescribing_volume, h.engagement_level,
  h.contact_frequency, h.first_contact_date, h.visit_count, h.last_visit_date,
  h.language, h.region, h.status, h.data_consent_at, h.data_consent_withdrawn_at,
  h.notes, h.tags, h.hco_id, h.primary_hco_id, h.preferred_contact, h.preferred_time,
  h.created_at, h.updated_at,
  o.name AS institution`.trim();

const HCP_RETURNING_COLS = `
  id, title, first_name, last_name, email, phone,
  primary_specialty, secondary_specialty, role, license_number, years_experience,
  is_key_opinion_leader, influence_tier, prescribing_volume, engagement_level,
  contact_frequency, first_contact_date, visit_count, last_visit_date,
  language, region, status, data_consent_at, data_consent_withdrawn_at,
  notes, tags, hco_id, primary_hco_id, preferred_contact, preferred_time,
  created_at, updated_at`.trim();

function isHCPSortColumn(s: string): s is (typeof HCP_SORT_COLUMNS)[number] {
  return HCP_SORT_COLUMNS.includes(s as (typeof HCP_SORT_COLUMNS)[number]);
}

async function resolveHcoId(
  institution: string,
  region: string
): Promise<{ id: string; name: string }> {
  const result = await getDb().query<{ id: string }>(
    `INSERT INTO tbl_hco (name, region, status) VALUES ($1, $2, 'active')
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [institution, region]
  );
  return { id: result.rows[0]!.id, name: institution };
}

export async function getHCPPaginated(
  filters: GetHCPFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<{ rows: HCP[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search?.trim()) {
    conditions.push(
      `(LOWER(h.first_name) LIKE $${paramIndex} OR LOWER(h.last_name) LIKE $${paramIndex} OR LOWER(COALESCE(h.email,'')) LIKE $${paramIndex} OR LOWER(COALESCE(h.primary_specialty,'')) LIKE $${paramIndex} OR LOWER(COALESCE(o.name,'')) LIKE $${paramIndex} OR LOWER(h.region) LIKE $${paramIndex})`
    );
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    paramIndex++;
  }
  const specialtyArr = toArray(filters.specialty);
  if (specialtyArr.length > 0) {
    conditions.push(`h.primary_specialty = ANY($${paramIndex}::text[])`);
    params.push(specialtyArr);
    paramIndex++;
  }
  const institutionArr = toArray(filters.institution);
  if (institutionArr.length > 0) {
    conditions.push(`o.name = ANY($${paramIndex}::text[])`);
    params.push(institutionArr);
    paramIndex++;
  }
  const regionArr = toArray(filters.region);
  if (regionArr.length > 0) {
    conditions.push(`h.region = ANY($${paramIndex}::text[])`);
    params.push(regionArr);
    paramIndex++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderCol = isHCPSortColumn(sortBy) ? sortBy : "created_at";
  const orderDir = sortOrder === "asc" ? "ASC" : "DESC";
  const safeOrder = orderCol === "created_at" ? "h.created_at" : `h."${orderCol}"`;

  try {
    const countResult = await getDb().query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM tbl_hcp h LEFT JOIN tbl_hco o ON h.hco_id = o.id ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await getDb().query<HCP>(
      `SELECT ${HCP_SELECT_COLS}
       FROM tbl_hcp h LEFT JOIN tbl_hco o ON h.hco_id = o.id
       ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return { rows: dataResult.rows, total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getHCPPaginated", err);
  }
}

export async function getHCPById(id: string): Promise<HCP | null> {
  try {
    const result = await getDb().query<HCP>(
      `SELECT ${HCP_SELECT_COLS}
       FROM tbl_hcp h LEFT JOIN tbl_hco o ON h.hco_id = o.id WHERE h.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getHCPById", err);
  }
}

export async function insertHCP(input: InsertHCPInput): Promise<HCP> {
  const firstName = trimOrEmpty(input.first_name);
  const lastName = trimOrEmpty(input.last_name);
  if (!firstName || !lastName) throw new ValidationError("HCP first_name and last_name are required");

  try {
    const region = trimOrEmpty(input.region);
    const hco = input.institution?.trim()
      ? await resolveHcoId(input.institution.trim(), region)
      : null;

    const result = await getDb().query<HCP>(
      `INSERT INTO tbl_hcp (
         first_name, last_name, title, email, phone, primary_specialty,
         hco_id, primary_hco_id, region, status, lead_id,
         influence_tier, engagement_level, prescribing_volume,
         preferred_contact, preferred_time, language, notes, tags
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, 'active', $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING ${HCP_RETURNING_COLS}`,
      [
        firstName,
        lastName,
        trimOrNull(input.title),
        trimOrNull(input.email),
        trimOrNull(input.phone),
        trimOrNull(input.primary_specialty),
        hco?.id ?? null,
        region,
        trimOrNull(input.lead_id),
        input.influence_tier ?? "C",
        input.engagement_level ?? "unknown",
        trimOrNull(input.prescribing_volume),
        trimOrNull(input.preferred_contact),
        trimOrNull(input.preferred_time),
        trimOrNull(input.language),
        trimOrNull(input.notes),
        input.tags ?? [],
      ]
    );
    const row = result.rows[0];
    if (!row) throw new DatabaseError("insertHCP", new Error("Insert returned no rows"));
    return { ...row, institution: hco?.name ?? null };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertHCP", err);
  }
}

export async function updateHCP(id: string, input: UpdateHCPInput): Promise<HCP | null> {
  const existing = await getHCPById(id);
  if (!existing) return null;

  try {
    const firstName = input.first_name !== undefined ? trimOrEmpty(input.first_name) : existing.first_name;
    const lastName = input.last_name !== undefined ? trimOrEmpty(input.last_name) : existing.last_name;
    const title = input.title !== undefined ? trimOrNull(input.title) : existing.title;
    const email = input.email !== undefined ? trimOrNull(input.email) : existing.email;
    const phone = input.phone !== undefined ? trimOrNull(input.phone) : existing.phone;
    const primarySpecialty = input.primary_specialty !== undefined ? trimOrNull(input.primary_specialty) : existing.primary_specialty;
    const region = input.region ?? existing.region ?? "";
    const influenceTier = input.influence_tier ?? existing.influence_tier;
    const engagementLevel = input.engagement_level ?? existing.engagement_level;
    const prescribingVolume = input.prescribing_volume !== undefined ? trimOrNull(input.prescribing_volume) : existing.prescribing_volume;
    const preferredContact = input.preferred_contact !== undefined ? trimOrNull(input.preferred_contact) : existing.preferred_contact;
    const preferredTime = input.preferred_time !== undefined ? trimOrNull(input.preferred_time) : existing.preferred_time;
    const language = input.language !== undefined ? trimOrNull(input.language) : existing.language;
    const notes = input.notes !== undefined ? trimOrNull(input.notes) : existing.notes;
    const tags = input.tags !== undefined ? input.tags : existing.tags;
    const institutionInput = input.institution !== undefined ? trimOrNull(input.institution) : (existing.institution ?? null);

    const hco = institutionInput ? await resolveHcoId(institutionInput, region) : null;

    const updateResult = await getDb().query<{ updated_at: Date }>(
      `UPDATE tbl_hcp SET
         first_name = $1, last_name = $2, title = $3, email = $4, phone = $5,
         primary_specialty = $6, hco_id = $7, primary_hco_id = $7, region = $8,
         influence_tier = $9, engagement_level = $10, prescribing_volume = $11,
         preferred_contact = $12, preferred_time = $13, language = $14, notes = $15, tags = $16,
         updated_at = now()
       WHERE id = $17
       RETURNING updated_at`,
      [
        firstName, lastName, title, email, phone,
        primarySpecialty, hco?.id ?? null, region,
        influenceTier, engagementLevel, prescribingVolume,
        preferredContact, preferredTime, language, notes, tags,
        id,
      ]
    );
    return {
      ...existing,
      first_name: firstName,
      last_name: lastName,
      title,
      email,
      phone,
      primary_specialty: primarySpecialty,
      hco_id: hco?.id ?? null,
      primary_hco_id: hco?.id ?? null,
      region,
      influence_tier: influenceTier,
      engagement_level: engagementLevel,
      prescribing_volume: prescribingVolume,
      preferred_contact: preferredContact,
      preferred_time: preferredTime,
      language,
      notes,
      tags,
      institution: hco?.name ?? institutionInput,
      updated_at: updateResult.rows[0]?.updated_at ?? existing.updated_at,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updateHCP", err);
  }
}
