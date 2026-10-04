import type { PoolClient } from "pg";
import { AppError, ConflictError, DatabaseError } from "../errors.js";

/**
 * DB layer — practitioner_organization (many-to-many affiliations, global
 * is_primary) and practitioner_assignment (per-rep primary_org_id).
 * See docs/stories/pwa-medico-view.md for the dual-scoped-primary design.
 */

export interface OrganizationAffiliation {
  id: string;              // practitioner_organization row id
  organization_id: string;
  name: string;
  type: string | null;
  address_line1: string | null;
  city: string | null;
  role: string | null;
  is_primary: boolean;
}

const AFFILIATION_SELECT_COLS = `
  po.id, po.organization_id, o.name, o.type, o.address_line1, o.city, po.role, po.is_primary
`;

const UNIQUE_VIOLATION = "23505";

export async function getOrganizationAffiliations(client: PoolClient, practitionerId: string): Promise<OrganizationAffiliation[]> {
  try {
    const result = await client.query<OrganizationAffiliation>(
      `SELECT ${AFFILIATION_SELECT_COLS}
       FROM practitioner_organization po
       JOIN organization o ON o.id = po.organization_id
       WHERE po.practitioner_id = $1
       ORDER BY po.is_primary DESC, o.name ASC`,
      [practitionerId]
    );
    return result.rows;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getOrganizationAffiliations", err);
  }
}

export async function getUserPrimaryOrganizationId(client: PoolClient, practitionerId: string, userId: string): Promise<string | null> {
  try {
    const result = await client.query<{ primary_org_id: string | null }>(
      `SELECT primary_org_id FROM practitioner_assignment WHERE practitioner_id = $1 AND user_id = $2`,
      [practitionerId, userId]
    );
    return result.rows[0]?.primary_org_id ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getUserPrimaryOrganizationId", err);
  }
}

export async function linkPractitionerOrganization(
  client: PoolClient,
  practitionerId: string,
  organizationId: string,
  role: string | null
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO practitioner_organization (practitioner_id, organization_id, role)
       VALUES ($1, $2, $3)`,
      [practitionerId, organizationId, role]
    );
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new ConflictError("Practitioner is already linked to this clinic");
    }
    if (err instanceof AppError) throw err;
    throw new DatabaseError("linkPractitionerOrganization", err);
  }
}

/**
 * Records how the practitioner relates to a clinic — NEO-51 uses "owner"
 * (runs the practice) vs "staff" (practises there), chosen by the doctor at
 * registration; it selects the partner agreement's party clause. Upserts:
 * links the clinic first if the affiliation row doesn't exist yet (e.g. a
 * practitioner known only through the legacy practitioner.organization_id).
 */
export async function setAffiliationRole(
  client: PoolClient,
  practitionerId: string,
  organizationId: string,
  role: string
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO practitioner_organization (practitioner_id, organization_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (practitioner_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
      [practitionerId, organizationId, role]
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("setAffiliationRole", err);
  }
}

/**
 * Deletes the affiliation, and clears any rep's practitioner_assignment
 * that pointed its primary_org_id at the same clinic — an assignment row's
 * primary_org_id must never reference a clinic the practitioner is no
 * longer affiliated with. Returns false if the affiliation didn't exist.
 */
export async function unlinkPractitionerOrganization(client: PoolClient, practitionerId: string, organizationId: string): Promise<boolean> {
  try {
    const result = await client.query<{ id: string }>(
      `DELETE FROM practitioner_organization WHERE practitioner_id = $1 AND organization_id = $2 RETURNING id`,
      [practitionerId, organizationId]
    );
    if (result.rows.length === 0) return false;

    await client.query(
      `UPDATE practitioner_assignment SET primary_org_id = NULL, updated_at = now()
       WHERE practitioner_id = $1 AND primary_org_id = $2`,
      [practitionerId, organizationId]
    );
    return true;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("unlinkPractitionerOrganization", err);
  }
}

/** Sets the single global primary for this practitioner — unsets every other affiliation first. */
export async function setGlobalPrimaryOrganization(client: PoolClient, practitionerId: string, organizationId: string): Promise<void> {
  try {
    await client.query(
      `UPDATE practitioner_organization SET is_primary = false WHERE practitioner_id = $1 AND is_primary = true`,
      [practitionerId]
    );
    await client.query(
      `UPDATE practitioner_organization SET is_primary = true WHERE practitioner_id = $1 AND organization_id = $2`,
      [practitionerId, organizationId]
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("setGlobalPrimaryOrganization", err);
  }
}

/** Upserts the calling rep's own primary clinic for this practitioner. */
export async function setUserPrimaryOrganization(client: PoolClient, practitionerId: string, userId: string, organizationId: string): Promise<void> {
  try {
    await client.query(
      `INSERT INTO practitioner_assignment (practitioner_id, user_id, primary_org_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (practitioner_id, user_id) DO UPDATE SET primary_org_id = EXCLUDED.primary_org_id, updated_at = now()`,
      [practitionerId, userId, organizationId]
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("setUserPrimaryOrganization", err);
  }
}

/** The address fields of the HCO a device order ships to (organization columns, as stored). */
export interface DeliveryOrganization {
  id: string;
  name: string;
  address_line1: string | null;
  city: string | null;
  postal_code: string | null;
  country_code: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

/**
 * Where a device ordered by this practitioner ships: their primary HCO
 * (practitioner_organization.is_primary), else their only affiliation, else
 * null — with several clinics and none marked primary there is no right one
 * to pick (Łukasz, 2026-10-03, NEO-213: orders always go to the ordering
 * doctor's primary HCO).
 */
export async function getDeliveryOrganization(client: PoolClient, practitionerId: string): Promise<DeliveryOrganization | null> {
  const rows = await listDeliveryOrganizations(client, practitionerId);
  const primary = rows.find((r) => r.is_primary);
  if (primary) return primary;
  return rows.length === 1 ? rows[0]! : null;
}

/**
 * Every clinic this practitioner is affiliated with, primary first — the
 * admin's choice of delivery address in the order wizard (NEO-210 D2).
 */
export async function listDeliveryOrganizations(client: PoolClient, practitionerId: string): Promise<DeliveryOrganization[]> {
  try {
    const { rows } = await client.query<DeliveryOrganization>(
      `SELECT o.id, o.name, o.address_line1, o.city, o.postal_code, o.country_code, o.phone, o.email, po.is_primary
       FROM practitioner_organization po
       JOIN organization o ON o.id = po.organization_id AND o.deleted_at IS NULL
       WHERE po.practitioner_id = $1
       ORDER BY po.is_primary DESC, o.name ASC`,
      [practitionerId]
    );
    return rows;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("listDeliveryOrganizations", err);
  }
}
