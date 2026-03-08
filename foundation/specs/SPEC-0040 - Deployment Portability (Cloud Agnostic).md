# SPEC-0040: Deployment Portability (Cloud Agnostic)

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: repo, bff  
Milestone: Phase 2

## 1) Goal
Ensure ability to move from Railway → GCP/AWS without rewriting app logic.

## 2) Requirements
- Dockerfile for BFF
- No cloud-specific code
- Env-based config
- Health + readiness probes

## 3) DoD
- Local docker-compose works
- BFF container runs standalone

## 4) Test plan
- Docker build succeeds
- docker-compose up brings BFF + deps
- Health/readiness return 200

## 5) Documentation updates
- Runbook: Docker deploy
- ADR: cloud-agnostic deployment

Date: 2026-02-18
