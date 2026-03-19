import { getDb } from "./connection.js";

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
  const p = getDb();
  if (!p) return { regions: [], specialties: [], institution_types: [] };

  const result = await p.query<ConfigOption & { type: string }>(
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
}

export async function insertConfigOption(
  data: { type: ConfigOptionType; value: string; label: string; sort_order?: number },
  tenantId = "neosleep"
): Promise<ConfigOption | null> {
  const p = getDb();
  if (!p) return null;

  const result = await p.query<ConfigOption>(
    `INSERT INTO tbl_config_options (type, value, label, sort_order, tenant_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (type, value, tenant_id) DO NOTHING
     RETURNING id, type, value, label, sort_order`,
    [data.type, data.value.trim(), data.label.trim(), data.sort_order ?? 0, tenantId]
  );
  return result.rows[0] ?? null;
}

export async function updateConfigOption(
  id: string,
  data: { label?: string; sort_order?: number },
  tenantId = "neosleep"
): Promise<ConfigOption | null> {
  const p = getDb();
  if (!p) return null;

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
  const result = await p.query<ConfigOption>(
    `UPDATE tbl_config_options SET ${sets.join(", ")}
     WHERE id = $${idx++} AND tenant_id = $${idx}
     RETURNING id, type, value, label, sort_order`,
    params
  );
  return result.rows[0] ?? null;
}

export async function deleteConfigOption(id: string, tenantId = "neosleep"): Promise<boolean> {
  const p = getDb();
  if (!p) return false;

  const result = await p.query(
    `DELETE FROM tbl_config_options WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return (result.rowCount ?? 0) > 0;
}
