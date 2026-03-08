    # SPEC-0011: Tenant config resolution in BFF

    Status: Draft  
    Owner: Neo Sleep Care  
    Milestone: MVP  
    Apps/Modules: bff

    ## 1) Goal
    Resolve tenant-config per request (by host/subdomain) with caching and versioning.

    ## 2) User story
    As a rep, I want the app to load correct branding/features/forms for my tenant automatically.

    ## 3) UX flow
    - App calls `GET /api/tenant/config` on boot
- App applies branding + default locale
- Admin/ops can bump version and rollback

    ## 4) Data & API
    Endpoints:
- `GET /api/tenant/config`
Rules:
- Resolve tenantId from host header
- Cache config (TTL)
- Return `etag`/version

    ## 5) Events & analytics
    - `bff_tenant_config_loaded` (internal metric only)

    ## 6) Edge cases
    - Unknown tenant
- Notion config missing
- Cache stampede

    ## 7) Acceptance criteria
    - Correct tenantId resolved by host
- Config cached
- Version returned
- Unknown tenant returns 404 with safe message

    ## 8) Test plan
    - Unit: host->tenant mapping
- Integration: cache hit/miss
- Contract: endpoint schema

    ## 9) Documentation updates
    - Update `foundation/config/tenant-config.sample.json`
- Update `modules/bff-service.md`

    Date: 2026-02-18
