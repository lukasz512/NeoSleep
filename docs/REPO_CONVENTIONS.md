# Repo conventions

## Branching
- `main` = stable
- feature branches: `feat/<short-name>`
- fix branches: `fix/<short-name>`

## Required artifacts per feature
- SPEC in `/foundation/specs`
- tests (unit + e2e for user flows)
- docs updates (module docs + bible if needed)
- changelog entry

## CI
- CI uruchamia lint, typecheck i testy w każdym workspace.
- Każdy workspace z definicją `test` w package.json musi mieć przynajmniej jeden test – inaczej CI się nie wykona (Vitest: `passWithNoTests: false`).

## Naming
- i18n keys: `<module>.<screen>.<key>`
- events: `snake_case`
