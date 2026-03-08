# ADR-0002: Separate HCP/patient portal from Rep app

Date: 2026-02-18
Status: Accepted
Owners: Neo Sleep Care

## Context
Rep app is B2B sales tooling. Future portal may contain sensitive medical/patient data and different auth (magic link).
Mixing these concerns increases risk and complexity.

## Decision
Keep portal as a separate app/subdomain with shared design tokens but separate routing, auth, and permissions.

## Consequences
+ Clear security/compliance boundary.
+ Cleaner UX per audience.
- Some shared UI must be packaged as reusable building blocks.
