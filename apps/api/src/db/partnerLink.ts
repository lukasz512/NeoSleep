import type { PoolClient } from "pg";
import { AppError, DatabaseError, NotFoundError } from "../errors.js";

/**
 * partner_link / partner_transaction — generic external partner order-sync
 * tracking (migration 018). `partner_link` is the current-state pointer;
 * `partner_transaction` is the append-only audit log of every API call made
 * for that link (see the migration file header for the full rationale).
 */

export interface PartnerLink {
  id: string;
  partner: string;
  entity_type: string;
  entity_id: string;
  external_id: string | null;
  external_status: string | null;
  sync_status: "pending" | "synced" | "failed";
  last_error: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerTransaction {
  id: string;
  partner_link_id: string;
  action: string;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  http_status: number | null;
  success: boolean;
  validation_report: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export interface InsertPartnerTransactionInput {
  partner_link_id: string;
  action: string;
  request_payload?: Record<string, unknown> | null;
  response_payload?: Record<string, unknown> | null;
  http_status?: number | null;
  success: boolean;
  validation_report?: Record<string, unknown> | null;
  error_message?: string | null;
}

const PARTNER_LINK_COLS =
  "id, partner, entity_type, entity_id, external_id, external_status, sync_status, last_error, last_synced_at, created_at, updated_at";

/** Fetches the current link for one entity, or null if this partner has never touched it. */
export async function getPartnerLink(
  client: PoolClient,
  partner: string,
  entityType: string,
  entityId: string
): Promise<PartnerLink | null> {
  try {
    const { rows } = await client.query<PartnerLink>(
      `SELECT ${PARTNER_LINK_COLS} FROM partner_link WHERE partner = $1 AND entity_type = $2 AND entity_id = $3`,
      [partner, entityType, entityId]
    );
    return rows[0] ?? null;
  } catch (err) {
    throw new DatabaseError("getPartnerLink", err);
  }
}

/**
 * Creates the link row before the first API call is made (external_id NULL,
 * sync_status 'pending'), so a partner_transaction row always has somewhere
 * to attach even if the call fails outright. Safe to call repeatedly —
 * returns the existing row untouched if one is already there (idempotent
 * "ensure" semantics, not a reset).
 */
export async function ensurePendingPartnerLink(
  client: PoolClient,
  partner: string,
  entityType: string,
  entityId: string
): Promise<PartnerLink> {
  try {
    const { rows } = await client.query<PartnerLink>(
      `INSERT INTO partner_link (partner, entity_type, entity_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (partner, entity_type, entity_id) DO UPDATE SET partner = EXCLUDED.partner
       RETURNING ${PARTNER_LINK_COLS}`,
      [partner, entityType, entityId]
    );
    return rows[0]!;
  } catch (err) {
    throw new DatabaseError("ensurePendingPartnerLink", err);
  }
}

export async function markPartnerLinkSynced(
  client: PoolClient,
  id: string,
  externalId: string,
  externalStatus: string | null
): Promise<PartnerLink> {
  try {
    const { rows } = await client.query<PartnerLink>(
      `UPDATE partner_link
       SET external_id = $2, external_status = $3, sync_status = 'synced',
           last_error = NULL, last_synced_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING ${PARTNER_LINK_COLS}`,
      [id, externalId, externalStatus]
    );
    if (!rows[0]) throw new NotFoundError("PartnerLink", id);
    return rows[0];
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("markPartnerLinkSynced", err);
  }
}

export async function markPartnerLinkFailed(client: PoolClient, id: string, errorMessage: string): Promise<PartnerLink> {
  try {
    const { rows } = await client.query<PartnerLink>(
      `UPDATE partner_link
       SET sync_status = 'failed', last_error = $2, updated_at = now()
       WHERE id = $1
       RETURNING ${PARTNER_LINK_COLS}`,
      [id, errorMessage]
    );
    if (!rows[0]) throw new NotFoundError("PartnerLink", id);
    return rows[0];
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("markPartnerLinkFailed", err);
  }
}

/** Updates only external_status/last_synced_at — used by the status-poll job, which doesn't touch external_id/sync_status (those are set once, at creation). */
export async function updatePartnerLinkStatus(client: PoolClient, id: string, externalStatus: string | null): Promise<PartnerLink> {
  try {
    const { rows } = await client.query<PartnerLink>(
      `UPDATE partner_link
       SET external_status = $2, last_synced_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING ${PARTNER_LINK_COLS}`,
      [id, externalStatus]
    );
    if (!rows[0]) throw new NotFoundError("PartnerLink", id);
    return rows[0];
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updatePartnerLinkStatus", err);
  }
}

/** Links not yet in one of the given terminal statuses — the status-sync job's worklist. */
export async function getPartnerLinksNeedingStatusSync(
  client: PoolClient,
  partner: string,
  entityType: string,
  terminalStatuses: string[]
): Promise<PartnerLink[]> {
  try {
    const { rows } = await client.query<PartnerLink>(
      `SELECT ${PARTNER_LINK_COLS} FROM partner_link
       WHERE partner = $1 AND entity_type = $2 AND sync_status = 'synced'
         AND external_id IS NOT NULL
         AND (external_status IS NULL OR NOT (external_status = ANY($3)))`,
      [partner, entityType, terminalStatuses]
    );
    return rows;
  } catch (err) {
    throw new DatabaseError("getPartnerLinksNeedingStatusSync", err);
  }
}

export interface PartnerTransactionHistory {
  link: PartnerLink | null;
  transactions: PartnerTransaction[];
}

/**
 * Everything the admin-only transaction-log UI needs for one entity: the
 * current-state pointer plus every call ever made for it, newest first. A
 * null `link` (never linked to this partner at all) still returns an empty
 * `transactions` array rather than throwing — "nothing happened yet" is a
 * normal, displayable state, not an error.
 */
export async function getPartnerTransactionHistory(
  client: PoolClient,
  partner: string,
  entityType: string,
  entityId: string
): Promise<PartnerTransactionHistory> {
  const link = await getPartnerLink(client, partner, entityType, entityId);
  if (!link) return { link: null, transactions: [] };

  try {
    const { rows } = await client.query<PartnerTransaction>(
      `SELECT id, partner_link_id, action, request_payload, response_payload,
              http_status, success, validation_report, error_message, created_at
       FROM partner_transaction
       WHERE partner_link_id = $1
       ORDER BY created_at DESC`,
      [link.id]
    );
    return { link, transactions: rows };
  } catch (err) {
    throw new DatabaseError("getPartnerTransactionHistory", err);
  }
}

export async function insertPartnerTransaction(
  client: PoolClient,
  input: InsertPartnerTransactionInput
): Promise<PartnerTransaction> {
  try {
    const { rows } = await client.query<PartnerTransaction>(
      `INSERT INTO partner_transaction (
         partner_link_id, action, request_payload, response_payload,
         http_status, success, validation_report, error_message
       ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7::jsonb, $8)
       RETURNING id, partner_link_id, action, request_payload, response_payload,
                 http_status, success, validation_report, error_message, created_at`,
      [
        input.partner_link_id,
        input.action,
        input.request_payload ? JSON.stringify(input.request_payload) : null,
        input.response_payload ? JSON.stringify(input.response_payload) : null,
        input.http_status ?? null,
        input.success,
        input.validation_report ? JSON.stringify(input.validation_report) : null,
        input.error_message ?? null,
      ]
    );
    return rows[0]!;
  } catch (err) {
    throw new DatabaseError("insertPartnerTransaction", err);
  }
}
