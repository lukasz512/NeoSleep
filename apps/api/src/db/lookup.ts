import type { PoolClient } from "pg";
import { getDb } from "./connection.js";
import { DatabaseError } from "../errors.js";

/**
 * THE TWO-TIER LOOKUP SYSTEM
 * ==========================
 * NeoCRM has two lookup tables that form a cascade (think CSS specificity):
 *
 *   1. platform.lookups  — global, read-only reference data seeded by NeoCRM.
 *      Contains: specialty, organization_type, encounter_type, encounter_status,
 *      lead_status, influence_tier, presentation_status, promotion_priority.
 *      These are locked (locked=true) and cannot be disabled by a tenant admin.
 *
 *   2. {tenant}.lookup   — tenant-level overrides and custom items.
 *      - global_id SET   → overrides the label or sort_order of a platform item.
 *      - global_id NULL  → a custom item the platform does not know about.
 *      - enabled=false   → hides a non-locked platform item for this tenant.
 *      Contains also tenant-specific types: 'region' (geographic territories
 *      specific to each pharma company's sales structure).
 *
 * WHAT DOES NOT BELONG HERE (config_options legacy):
 *   The old config_options table stored region, specialty, institution_type.
 *   specialty and institution_type duplicate platform.lookups — replaced by this module.
 *   region was tenant-specific — it now lives in {tenant}.lookup type='region'.
 *
 * HOW TO QUERY:
 *   - All route handlers must pass the tenant's PoolClient (from withTenant) to ensure
 *     the search_path is already set to the tenant schema.
 *   - Platform lookups are always queried via their full schema path: platform.lookups.
 *   - Tenant lookups use the search_path-relative name: lookup (resolves to {tenant}.lookup).
 */

export interface LookupItem {
  key: string;
  value: string;
  locale: string;
  sort_order: number;
  locked: boolean;
  custom: boolean; // true = tenant-only item, not from platform
}

export interface ConfigOptions {
  regions: LookupItem[];
  specialties: LookupItem[];
  organization_types: LookupItem[];
}

/**
 * Returns effective lookups for a given type and locale.
 * Tenant override takes precedence over platform default.
 * Requires a PoolClient with search_path set to the tenant schema.
 */
export async function getTenantLookup(
  client: PoolClient,
  type: string,
  locale = "en"
): Promise<LookupItem[]> {
  try {
    const result = await client.query<LookupItem & { custom: boolean }>(
      `SELECT
         COALESCE(t.key,        g.key)        AS key,
         COALESCE(t.value,      g.value)      AS value,
         $2                                   AS locale,
         COALESCE(t.sort_order, g.sort_order) AS sort_order,
         COALESCE(g.locked, false)            AS locked,
         false                                AS custom
       FROM platform.lookups g
       LEFT JOIN lookup t
         ON t.global_id = g.id AND t.locale = $2 AND t.enabled = true
       WHERE g.type = $1 AND g.locale = $2
         AND COALESCE(t.enabled, true) = true
       UNION ALL
       SELECT key, value, $2, sort_order, false AS locked, true AS custom
       FROM lookup
       WHERE type = $1 AND locale = $2 AND global_id IS NULL AND enabled = true
       ORDER BY sort_order, key`,
      [type, locale]
    );
    return result.rows;
  } catch (err) {
    throw new DatabaseError("getTenantLookup", err);
  }
}

/**
 * Returns the three option groups used by the app's filter dropdowns.
 * Replaces the legacy getConfigOptions() from config-options.ts.
 *
 * - specialties      → platform.lookups type='specialty'  (with tenant overrides)
 * - organization_types → platform.lookups type='organization_type' (with tenant overrides)
 * - regions          → tenant.lookup type='region' (tenant-specific only — no platform default)
 *
 * Requires a PoolClient with search_path set to the tenant schema.
 */
export async function getConfigOptions(client: PoolClient, locale = "en"): Promise<ConfigOptions> {
  const [specialties, organization_types, regions] = await Promise.all([
    getTenantLookup(client, "specialty", locale),
    getTenantLookup(client, "organization_type", locale),
    // Regions are tenant-only — query tenant.lookup directly, no platform layer
    client.query<LookupItem>(
      `SELECT key, value, $1 AS locale, sort_order, false AS locked, true AS custom
       FROM lookup
       WHERE type = 'region' AND locale = $1 AND enabled = true
       ORDER BY sort_order, value`,
      [locale]
    ).then((r) => r.rows).catch((err) => { throw new DatabaseError("getConfigOptions:region", err); }),
  ]);

  return { specialties, organization_types, regions };
}

/**
 * Upserts a tenant-level lookup item (custom or override).
 * For overrides: provide global_id. For custom items: leave global_id null.
 */
export async function upsertTenantLookupItem(
  client: PoolClient,
  data: {
    type: string;
    key: string;
    value: string;
    locale?: string;
    sort_order?: number;
    global_id?: string | null;
    enabled?: boolean;
  }
): Promise<LookupItem> {
  try {
    const result = await client.query<LookupItem>(
      `INSERT INTO lookup (type, key, value, locale, sort_order, global_id, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (type, key, locale)
         DO UPDATE SET value = EXCLUDED.value, sort_order = EXCLUDED.sort_order,
                       enabled = EXCLUDED.enabled
       RETURNING key, value, locale, sort_order,
                 false AS locked, (global_id IS NULL) AS custom`,
      [
        data.type,
        data.key,
        data.value,
        data.locale ?? "en",
        data.sort_order ?? 0,
        data.global_id ?? null,
        data.enabled ?? true,
      ]
    );
    return result.rows[0];
  } catch (err) {
    throw new DatabaseError("upsertTenantLookupItem", err);
  }
}

/**
 * Disables a non-locked platform lookup item for this tenant.
 * Locked items cannot be disabled.
 */
export async function disableTenantLookupItem(
  client: PoolClient,
  globalId: string
): Promise<boolean> {
  try {
    // Check that the platform item is not locked before allowing override
    const check = await getDb().query<{ locked: boolean }>(
      `SELECT locked FROM platform.lookups WHERE id = $1`,
      [globalId]
    );
    if (!check.rows[0] || check.rows[0].locked) return false;

    await client.query(
      `INSERT INTO lookup (type, key, value, locale, global_id, enabled)
       SELECT type, key, value, locale, id, false
       FROM platform.lookups WHERE id = $1
       ON CONFLICT (type, key, locale) DO UPDATE SET enabled = false`,
      [globalId]
    );
    return true;
  } catch (err) {
    throw new DatabaseError("disableTenantLookupItem", err);
  }
}
