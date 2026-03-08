# Security model (v1)

## Auth
- Reps: Google Workspace OIDC (2FA enforced via Workspace policy)
- Portal: magic link email (later)

## Authorization
- RBAC: rep / manager / admin
- Region scoping enforced server-side in BFF

## Sensitive data
Treat medical/patient data as sensitive by default.
- No sensitive data in logs
- Redaction at boundaries
