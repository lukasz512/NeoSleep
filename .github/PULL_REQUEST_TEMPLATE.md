## Summary
<!-- What does this PR do, and why? 1-3 sentences — the "why" matters more than the "what" here, the diff already shows the what. -->

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup (no behavior change)
- [ ] Documentation
- [ ] Infrastructure / CI/CD

## Changes
<!-- Bullet list, grouped by area if this spans several (backend / frontend / infra / docs). -->

## Testing
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm build:pwa` / `pnpm build:web` (if the change touches either app)
- [ ] Manual verification in-browser — describe what was actually clicked/checked, not just "tested"
- [ ] New or updated automated tests

## Compliance & data impact
<!-- See CLAUDE.md's Compliance Data Map / arch skill — check what applies, delete what doesn't. -->
- [ ] Touches personal or health data (GDPR Art. 6/9) — describe below
- [ ] Adds/changes an `audit_log` write for a mutation
- [ ] Crosses a tenant boundary — confirm `withTenant()` wraps every new query
- [ ] No compliance-relevant impact

## Screenshots / recordings
<!-- UI changes only — before/after, mobile + desktop if layout is affected. -->

## Rollback
<!-- Safe to revert as-is? Any migration, cache, or external-partner state that wouldn't roll back cleanly with the code? -->

## Related
<!-- ADRs, issues, prior PRs this builds on or supersedes. -->
