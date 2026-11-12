## Scalability Review (Before Shipping a Feature)

Ask these questions before any feature goes to PROD:

1. **Tenant onboarding**: could a new pharma company use this feature without code changes?
2. **Configuration vs code**: is this behavior configurable per tenant, or hardcoded?
3. **Data isolation**: any risk of cross-tenant data leakage at scale?
4. **Manual intervention**: does adding tenant #5 require a developer?
5. **PCF flexibility**: can a new tenant define their own Post Call Form schema?
6. **Branding**: can white-label (logo, colors, domain) be done without a deploy?
7. **Performance at load**: what happens when Tenant A has 200 reps and 50,000 HCP records?
8. **Multi-language**: can a new tenant add a language without touching code?

### Bottleneck Patterns to Flag
- Hardcoded tenant IDs or schema names in application code
- PCF schema defined in code (should be in DB config per tenant)
- Navigation items or feature flags not driven by config
- User roles defined as string literals instead of DB-driven RBAC
- Shared tables where tenant-scoped tables should be used
- Missing indexes on commonly filtered columns
- CI/CD pipelines requiring manual per-tenant configuration
- **Veeva/IQVIA migration path**: could an existing customer import their data? Plan the data model to support it.

---
