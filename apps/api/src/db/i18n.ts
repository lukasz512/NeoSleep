import { AppError, DatabaseError } from "../errors.js";
import { withTenant, tenantSlugFromHost } from "./tenant.js";

export type I18nOverrides = Record<string, Record<string, string>>;

export async function getI18nOverrides(): Promise<I18nOverrides> {
  try {
    const result = await withTenant(tenantSlugFromHost(""), (client) =>
      client.query<{ locale: string; key: string; value: string }>(
        `SELECT locale, key, value FROM i18n_overrides ORDER BY locale, key`
      )
    );
    const out: I18nOverrides = {};
    for (const row of result.rows) {
      if (!out[row.locale]) out[row.locale] = {};
      out[row.locale][row.key] = row.value;
    }
    return out;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getI18nOverrides", err);
  }
}

export async function upsertI18nOverrides(
  locale: string,
  overrides: Record<string, string | null>
): Promise<I18nOverrides> {
  const entries = Object.entries(overrides);
  if (entries.length === 0) return getI18nOverrides();
  try {
    const deleteKeys = entries.filter(([, v]) => v === null).map(([k]) => k);
    const upsertEntries = entries.filter((e): e is [string, string] => e[1] !== null);

    await withTenant(tenantSlugFromHost(""), async (client) => {
      if (deleteKeys.length > 0) {
        await client.query(
          `DELETE FROM i18n_overrides WHERE locale = $1 AND key = ANY($2::text[])`,
          [locale, deleteKeys]
        );
      }
      if (upsertEntries.length > 0) {
        const keys = upsertEntries.map(([k]) => k);
        const values = upsertEntries.map(([, v]) => v);
        await client.query(
          `INSERT INTO i18n_overrides (locale, key, value, updated_at)
           SELECT $1, unnest($2::text[]), unnest($3::text[]), now()
           ON CONFLICT (locale, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [locale, keys, values]
        );
      }
    });
    return getI18nOverrides();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("upsertI18nOverrides", err);
  }
}
