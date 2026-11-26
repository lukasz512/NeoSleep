# i18n

- EN is source-of-truth (`en.json`)
- Other locales are auto-translated and then reviewed.

## Pipelines
- `pnpm i18n:extract` adds missing keys to `en.json`
- `pnpm i18n:unused` marks unused keys with metadata file
- `pnpm i18n:prune` removes keys after safety window
