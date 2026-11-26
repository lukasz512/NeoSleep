## Refined User Story: Unified Territory + RBAC Scope (ltree)

**Classification**: feature/architecture — merges two previously-separate mechanisms (RBAC country scope, and the descriptive Territory hierarchy from `hcp-hco-territory-redesign.md`) into one, and wires real access-control enforcement into Patient/HCP/HCO queries for the first time.

**Raw input**: Łukasz, after reviewing the earlier Territory rollout: "potrzebuje jedno dzialajace rozwizanie... to ma byc rozwiazanie wielu krajow... user dostaje kraj, albo global. wtedy user widzi pacjentow tylko z danego kraju. hcp/lead/patient maja swoje teritory: provincja/ciudad/barrio. potem bedzie tak, ze pacjent jak powie gdzie jest to dostanie liste lekarzy z tego barrio... chcemy zeby to bylo robust i zeby to mozna bylo skalowac latwo... jak da sie to zrobic jednym teritory to tak chce, nie potrzebujemy 2 funkcjonalnosci do tak prostej rzeczy." Also flagged a future move to one-database-per-country, and asked to research how this is "done professionally."

### As an admin, I want to assign each user a country (or "everywhere"), and have that actually restrict which patients/HCPs/HCOs they can see, using the same territory hierarchy already built for HCP/HCO/Patient addresses, so that access control and future HCP↔patient proximity matching share one mechanism instead of two.

### Stakeholder Notes
- User (rep/manager/admin): A country-scoped user now genuinely only sees records inside their country (or its full sub-hierarchy) once records carry a `territory_id` — previously this was cosmetic (the `scope` field existed but only gated the Users-management screen itself).
- Client/Tenant: Directly closes the P0 gap flagged in `docs/stories/security-hardening-token-storage-and-patient-row-scoping.md` (a concurrent session's finding — patient/practitioner/organization queries didn't apply the caller's scope at all). That story's open question ("is scope purely territory_id, or does region also gate access") is answered here: territory_id (ltree), not the legacy flat region text.
- Patient: No visible UI change, but this is the access-control layer clinical data now flows through — same records, now actually gated by who's allowed to see them.
- NeoCRM/Platform: `ltree` (Postgres's standard hierarchical-path extension, confirmed available on this Supabase project) makes "is this record inside that scope" one indexed containment check (`<@`), reused identically whether the scope is a specific country or the reserved 'global' root — no separate "unrestricted" code path anywhere. Also sets up the next feature (patient states their barrio → gets nearby doctors) on the same `path` column with zero new schema.
- Compliance: `AUDIT_FIELD_ALLOWLIST` and existing audit_log writes are untouched by this change; access is now more restrictive than before by default for any user who *is* given a non-global scope (previously scope did nothing outside Users), never less.

### Architecture decision
Extended `territory` (5-level country→region→city→village→district hierarchy, existing) with:
- `path LTREE`, GiST-indexed, maintained in application code on insert/reparent (`db/territory.ts`'s `recomputeTerritorySubtreePath` — this codebase computes derived columns explicitly per-query, e.g. `updated_at = now()`, not via DB triggers, so this follows the same convention rather than introducing the first trigger).
- One reserved `kind='global'` root per tenant; every country becomes its child — a global scope is just "assigned the root," so the same `<@` check handles both cases.
- `user_roles.scope` (TEXT: country_code | 'global') replaced by `user_roles.territory_id` (UUID FK, NOT NULL, defaults to the global root) — preserves migration 013's exact anti-duplicate-grant `UNIQUE(user_id, role, territory_id)` property.
- `extensions` added to `withTenant()`'s `SET LOCAL search_path` (`db/tenant.ts`) — confirmed empirically that an extension-provided type/operator (unlike a column DEFAULT, resolved once at CREATE TABLE time) needs to be reachable at query time, and wasn't before.

Migrations: `022_territory_ltree_scope.sql` (the mechanism), `023_territory_country_kind_fix.sql` (corrected a real pre-existing data bug this surfaced — migration 020 had left the actual country-level nodes mistyped as `kind='region'`), `024_territory_path_default.sql` (placeholder DEFAULT so a plain INSERT doesn't violate NOT NULL before the recompute step runs).

### Acceptance Criteria
- [x] `user_roles.territory_id` replaces `scope`; `getAllowedScopePaths`/`assertTerritoryAccess`/`assertTerritoryAccessByTerritoryId` (`middleware/requireScope.ts`) replace the old country-string versions.
- [x] `GetPatientListQuery`/`GetPractitionerListQuery`/`GetOrganizationListQuery` (and their by-id equivalents) apply the caller's scope — the exact gap the other session's security story flagged.
- [x] Write paths match read paths (NEO-47, 2026-09-25): `UpdatePatientCommand` and `DeletePatientCommand` run the same `assertTerritoryAccessByTerritoryId` check as `GetPatientByIdQuery`, and a `territory_id` change is also checked against the *target* territory, so a patient can't be moved out of the caller's reach. Practitioner/organization history + documents sub-routes are the remaining read-side gap (NEO-48).
- [x] A record with no `territory_id` assigned yet stays visible regardless of scope (rollout-safety fallback — zero records have one populated as of this writing; tightening this is a follow-up once backfilled).
- [x] `userForm.ts` gets a real `territory_id` field, restricted to `kind IN ('country','global')` (`loadScopeTerritoryOptions`) — previously there was no UI at all for setting a user's RBAC scope.
- [x] Full `apps/api` suite green (201/201) against the real dev DB, `apps/pwa` green except the pre-existing, unrelated `AppLayout.spec.ts` debt.
- [x] `vitest.global-setup.ts` seeds a minimal Global/PL/MX territory fixture into the isolated "test" tenant schema — required because `user_roles.territory_id` is now NOT NULL with no string-literal default, and "test" isn't in `platform.tenants` so migrations never touch it.

### Open Questions
- [ ] Real `territory_id` backfill onto existing Patient/HCP/HCO/Lead records — still explicitly deferred (no reliable automated mapping from today's free-text `region`).
- [ ] Lead entity was not wired into scope enforcement this pass (Patient/HCP/HCO only, matching the original small-fixes request) — needs the identical treatment before scope is a complete guarantee across all four entities.
- [ ] `docs/stories/security-hardening-token-storage-and-patient-row-scoping.md` (concurrent session) should be reconciled against this — flagged to Łukasz to check both sessions don't land divergent answers to the same gap.
- [ ] No browser/visual verification this pass either (same constraint as the earlier territory story) — recommend an in-browser pass on the new userForm territory field before shipping.

### Hand-off
-> Reconcile with the concurrent security-hardening session; then Lead scoping + real backfill as follow-ups.

### Follow-up — sub-routes (NEO-48, 2026-09-25)
History and documents (list + download URL) for Patient/HCP/HCO go through `queries/entityAccess.ts` (`require{Patient,Practitioner,Organization}InScope`) — the parent is fetched first, 404 if gone, 403 if outside the caller's territory. Before this, `/practitioner|organization/:id/{history,documents}` and `/patient/:id/history` answered for any id regardless of territory.
