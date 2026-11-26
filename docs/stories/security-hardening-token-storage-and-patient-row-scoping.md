## Refined User Story: Security Hardening — Auth Token Storage & Patient-Data Row-Level Access Control

**Classification**: feature — this is a workflow/architecture change to session handling and read authorization, not a bugfix; it changes how every client authenticates and how every role-scoped query behaves.

**Raw input**: Two P0 findings from an `/audit` review — (1) JWT stored in `localStorage` + logout doesn't invalidate server-side; (2) patient/practitioner/organization/lead read queries don't apply the caller's region scope, letting any authenticated role fetch any record by ID. Lukasz: "do both, write good tests, check skills, do it properly, then refactor, then test twice."

### As a rep/KAM/FFM/MSL/admin, I want my session token to be unusable after logout and my API access to be scoped to my assigned region, so that a stolen token or a crafted request can't expose patient health data I'm not authorized to see.

### Stakeholder Notes
- User: Field reps and KAMs currently trust that logging out "ends" their session and that they only ever see their own region's records — both assumptions are silently false today. No visible workflow changes if this is fixed correctly.
- Client: The pharma tenant is legally the data controller for its patients' health records. An IDOR that lets any rep pull any patient cross-region is exactly what a client's own compliance/legal team would flag in a security questionnaire before signing.
- Patient: Direct effect — sleep-study results, diagnosis codes, and contact info are read through this exact path.
- NeoCRM/Platform: Built as the general scoping mechanism (already exists: `requireScope.ts`), applied consistently across patient/practitioner/organization/lead, not a patient-only patch.
- Compliance: GDPR Art. 5(1)(f) and Art. 32. Worth a dated note that this access-control gap was found and closed.

### Decisions made (2026-09-16)
- **Token storage: Option A** — in-memory access token (not localStorage) + short-lived httpOnly refresh cookie scoped to the API's own domain only (never sent cross-site, so Safari/iOS ITP — the reason bearer-in-localStorage was adopted in the first place — never sees it) + a `jti`-per-token revocation table so `POST /auth/logout` kills only that session, not `token_version`'s all-devices bump.
- **Scoping key: `country_code`/`region`, NOT territory `ltree`.** Territory hierarchy work (`022_territory_ltree_scope.sql`, `023_territory_country_kind_fix.sql`) is still in progress on a separate branch/worktree and not typecheck/test-clean — deliberately not depended on here. See memory `project_territory_admin_crud_needed_soon` and `docs/foundation/FEATURE_BACKLOG.md` for that cleanup TODO. Reconciling flat `country_code` scoping vs. the eventual `ltree` territory path is future work, tracked there, not blocking this fix.
- **Scope of this PR**: token storage/logout fix + scoping fix both land together (same worktree/branch), since both are backend security fixes reviewed together. Delivered as a clean PR off `dev`, isolated from the in-flight territory/RBAC branch.

### Acceptance Criteria
- [ ] Access token is not readable by page JS at rest (in-memory only) and not persisted across a hard reload except via the httpOnly refresh cookie.
- [ ] `POST /auth/logout` revokes the specific token/session used to call it (via `jti` revocation check) — a token captured before logout fails on the next authenticated request. Other devices/sessions for the same user remain valid.
- [ ] `GET /api/v1/patient`, `/api/v1/practitioner`, `/api/v1/organization`, `/api/v1/lead` (list + by-id) apply `getAllowedCountryCodes`/`assertScopeAccess` from `requireScope.ts` — a region-scoped role cannot list or fetch a record outside its allowed `country_code`(s).
- [ ] A role with `scope: 'global'` on any of its `user_roles` rows is unrestricted (matches existing `requireScope.ts` semantics — no new role concept introduced).
- [ ] Integration tests hit a real Postgres (no mock-only auth/DB tests) — covering: token unusable post-logout, other-device session still valid, cross-region read blocked (403), same-region read allowed, global-scope role unrestricted.
- [ ] Full test suite run twice after refactor, both green.
- [ ] `pnpm audit` dependency-scan CI gap tracked separately — not blocking this PR.

### Open Questions
- [x] Non-PWA consumers of `Authorization: Bearer`? — grepped `apps/telegram` and `apps/api/client`: no matches found. Re-verify at implementation time before removing header support entirely (consider keeping header as a fallback path if any script/job client turns up).
- [x] Territory vs. country_code scoping — resolved above: country_code now, territory reconciliation deferred and tracked.
- [ ] `patient` table has no `country_code` column of its own (unlike practitioner/organization/lead, which join it from `identities`) — it stores `region` (free text) directly on `patient`. Confirm `region` values are consistently `'PL'`/`'MX'` (matching `country_code` elsewhere) before reusing `assertScopeAccess` against it, or whether a real `country_code` column should be added to `patient` for consistency (schema question for `/dba`/`/arch` if values are inconsistent).

### Hand-off
-> Implementation, this worktree (`worktree-security-token-and-scoping`)
