# SPEC-0006: i18n Extraction + Prune Pipeline

Status: Draft
Apps/Modules: repo
Milestone: MVP

## Goal
Self-maintaining translation system.

## Requirements
- Extract keys from source
- Add missing keys to en.json
- Detect unused keys
- Mark unusedSince
- Prune after N releases
- Auto-translate new keys via Make + OpenRouter PR

## CI
- pnpm i18n:extract
- pnpm i18n:unused
- pnpm i18n:prune

## Tests
- Add fake key → appears in en.json
- Remove key → appears in _unused.json  