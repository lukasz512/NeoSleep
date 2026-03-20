import { getDb } from "./connection.js";

export type I18nOverrides = Record<string, Record<string, string>>;

/** Returns all DB overrides grouped by locale: { en: { key: value }, pl: {...}, es: {...} } */
export async function getI18nOverrides(): Promise<I18nOverrides> {
  const p = getDb();
  if (!p) return {};
  try {
    const result = await p.query<{ locale: string; key: string; value: string }>(
      `SELECT locale, key, value FROM tbl_i18n_overrides ORDER BY locale, key`
    );
    const out: I18nOverrides = {};
    for (const row of result.rows) {
      if (!out[row.locale]) out[row.locale] = {};
      out[row.locale][row.key] = row.value;
    }
    return out;
  } catch (err) {
    console.error("getI18nOverrides error:", err);
    return {};
  }
}

/** Upserts overrides for a single locale. Passing null value removes the override.
 *  Returns the full updated overrides map. */
export async function upsertI18nOverrides(
  locale: string,
  overrides: Record<string, string | null>
): Promise<I18nOverrides> {
  const p = getDb();
  if (!p) return {};
  const entries = Object.entries(overrides);
  if (entries.length === 0) return getI18nOverrides();
  try {
    const deleteKeys = entries.filter(([, v]) => v === null).map(([k]) => k);
    const upsertEntries = entries.filter((e): e is [string, string] => e[1] !== null);

    if (deleteKeys.length > 0) {
      await p.query(
        `DELETE FROM tbl_i18n_overrides WHERE locale = $1 AND key = ANY($2::text[])`,
        [locale, deleteKeys]
      );
    }
    if (upsertEntries.length > 0) {
      const keys = upsertEntries.map(([k]) => k);
      const values = upsertEntries.map(([, v]) => v);
      await p.query(
        `INSERT INTO tbl_i18n_overrides (locale, key, value, updated_at)
         SELECT $1, unnest($2::text[]), unnest($3::text[]), now()
         ON CONFLICT (locale, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [locale, keys, values]
      );
    }
    return getI18nOverrides();
  } catch (err) {
    console.error("upsertI18nOverrides error:", err);
    throw err;
  }
}
