# i18n scripts (unused & prune)

Scripts in `scripts/i18n/` help keep locale files in sync with the codebase.

## Commands (from repo root)

| Command | Description |
|--------|-------------|
| `pnpm i18n:unused` | Scan apps/packages/website for `t('key')` / `t("key")` and write **unused** keys to `i18n/_unused.json`. |
| `pnpm i18n:prune` | **Dry run**: log which keys would be removed from each locale file; write log to `i18n/_prune-log.txt`. No files modified. |
| `pnpm i18n:prune --apply` | Actually remove those keys from all locale JSON files (en, pl, es, etc.) and write the same log. |
| `pnpm i18n:extract` | Placeholder (no-op). Reserved for future key extraction from source. |

## Flow

1. **Run `pnpm i18n:unused`**  
   - Scans `.vue`, `.ts`, `.js` under `apps/`, `packages/`, `website/`.  
   - Collects keys from `t("key")`, `t('key')`, `$t("key")`, `i18n.t("key")`.  
   - Compares with `i18n/en.json` and writes keys that are **not** referenced (static scan only) to `i18n/_unused.json`.  
   - Logs: number of files scanned, used keys count, total keys in en.json, unused count, and the first 30 unused keys.

2. **Run `pnpm i18n:prune`** (dry run)  
   - Reads `i18n/_unused.json`.  
   - For each locale file (`en.json`, `pl.json`, `es.json`, etc.), logs: **"Would remove 'key' from file.json"** for every key that exists in that file and is in the unused list.  
   - Writes a summary and the full log to **`i18n/_prune-log.txt`** so you can see exactly what would be removed.  
   - **Does not modify any locale file.**

3. **Run `pnpm i18n:prune --apply`** (apply)  
   - Same as above, but **removes** those keys from the locale files and writes them back.  
   - Log uses **"Removed 'key' from file.json"**.  
   - `i18n/_prune-log.txt` is always updated with the last run (dry or apply).

## Important notes

- **Static scan only**: Keys used via dynamic expressions (e.g. `` t(`rep.${name}.title`) ``) are **not** detected. They will appear as "unused" and would be removed by prune. Review `_unused.json` and `_prune-log.txt` before running `--apply`; remove any key from `_unused.json` by hand if it is used dynamically, or do not use `--apply` for that run.
- **Logs**: Every run of `prune` (dry or with `--apply`) writes **`i18n/_prune-log.txt`** with one line per key and a summary, so you always have a record of what was or would be removed.
- **extract**: `i18n:extract` is a placeholder and does not add or update keys yet.
