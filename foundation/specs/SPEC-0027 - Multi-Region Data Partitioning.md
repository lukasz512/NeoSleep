# SPEC-0027: Multi-Region Data Partitioning

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: bff  
Milestone: Phase 2 / Scale

## 1) Goal
Prepare architecture for region separation (e.g. MX, EU).

## 2) User story
As the platform, we need region-based data segregation so that we can comply with data residency and scale per region.

## 3) Requirements
- Region field on tenant
- Region-based data segregation
- Future DB sharding compatibility

## 4) Data & API
- All queries filtered by tenant region
- No cross-region reads/writes

## 5) Acceptance criteria
- Region filter enforced server-side
- No cross-region queries

## 6) Test plan
- Unit: region in tenant resolution
- Integration: cross-region request rejected or empty
- ADR for sharding strategy

## 7) Documentation updates
- ADR: multi-region partitioning
- Runbook: region config

Date: 2026-02-18
