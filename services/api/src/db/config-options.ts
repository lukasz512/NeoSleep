import { getDb } from "./connection.js";
import { AppError, DatabaseError } from "../errors.js";

export type ConfigOptionType = "region" | "specialty" | "institution_type";

export interface ConfigOption {
  id: string;
  type: ConfigOptionType;
  value: string;
  label: string;
  sort_order: number;
}

export interface ConfigOptions {
  regions: ConfigOption[];
  specialties: ConfigOption[];
  institution_types: ConfigOption[];
}

const ALLOWED_TYPES: ConfigOptionType[] = ["region", "specialty", "institution_type"];

function isAllowedType(t: unknown): t is ConfigOptionType {
  return ALLOWED_TYPES.includes(t as ConfigOptionType);
}

export async function getConfigOptions(tenantId = "neosleep"): Promise<ConfigOptions> {
  try {
    const result = await getDb().query<ConfigOption & { type: string }>(
      `SELECT id, type, value, label, sort_order
       FROM tbl_config_options
       WHERE tenant_id = $1
       ORDER BY type, sort_order, label`,
      [tenantId]
    );

    const regions: ConfigOption[] = [];
    const specialties: ConfigOption[] = [];
    const institution_types: ConfigOption[] = [];

    for (const row of result.rows) {
      const option: ConfigOption = {
        id: row.id,
        type: isAllowedType(row.type) ? row.type : "region",
        value: row.value,
        label: row.label,
        sort_order: row.sort_order,
      };
      if (row.type === "region") regions.push(option);
      else if (row.type === "specialty") specialties.push(option);
      else if (row.type === "institution_type") institution_types.push(option);
    }

    return { regions, specialties, institution_types };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getConfigOptions", err);
  }
}

export async function insertConfigOption(
  data: { type: ConfigOptionType; value: string; label: string; sort_order?: number },
  tenantId = "neosleep"
): Promise<ConfigOption | null> {
  try {
    const result = await getDb().query<ConfigOption>(
      `INSERT INTO tbl_config_options (type, value, label, sort_order, tenant_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (type, value, tenant_id) DO NOTHING
       RETURNING id, type, value, label, sort_order`,
      [data.type, data.value.trim(), data.label.trim(), data.sort_order ?? 0, tenantId]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertConfigOption", err);
  }
}

export async function updateConfigOption(
  id: string,
  data: { label?: string; sort_order?: number },
  tenantId = "neosleep"
): Promise<ConfigOption | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (typeof data.label === "string" && data.label.trim()) {
    sets.push(`label = $${idx++}`);
    params.push(data.label.trim());
  }
  if (typeof data.sort_order === "number") {
    sets.push(`sort_order = $${idx++}`);
    params.push(data.sort_order);
  }
  if (sets.length === 0) return null;

  params.push(id, tenantId);
  try {
    const result = await getDb().query<ConfigOption>(
      `UPDATE tbl_config_options SET ${sets.join(", ")}
       WHERE id = $${idx++} AND tenant_id = $${idx}
       RETURNING id, type, value, label, sort_order`,
      params
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updateConfigOption", err);
  }
}

export async function deleteConfigOption(id: string, tenantId = "neosleep"): Promise<boolean> {
  try {
    const result = await getDb().query(
      `DELETE FROM tbl_config_options WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("deleteConfigOption", err);
  }
}
