# SPEC-0031: Data Schema Canonical Model (Type-First)

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: bff, packages  
Milestone: Phase 2

## 1) Goal
Define canonical TypeScript domain models independent from Notion so that API and future DB use one source of truth.

## 2) Scope
- Lead
- HCP
- HCO
- Meeting
- Consent
- Tenant
- Event

## 3) Rules
- All API responses use canonical types
- Notion adapter maps → canonical
- Future DB migration uses same types

## 4) DoD
- /packages/domain-model/ created
- Types exported
- Zod schemas created
- Contract tests validate response shape

## 5) Test plan
- Contract tests: BFF responses match canonical schema
- Notion adapter unit tests: raw → canonical mapping

## 6) Documentation updates
- Architecture Bible (domain model)
- ADR: type-first canonical model

Date: 2026-02-18
