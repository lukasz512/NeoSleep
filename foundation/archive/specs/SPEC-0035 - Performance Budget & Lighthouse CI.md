# SPEC-0035: Performance Budget & Lighthouse CI

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: website, rep  
Milestone: Phase 2

## 1) Goal
Guarantee performance baseline so that rep app and website stay fast.

## 2) Targets
- Lighthouse ≥ 90
- JS bundle under X KB
- First load under Y seconds

## 3) DoD
- Lighthouse CI added
- Failing PR blocks if below threshold

## 4) Test plan
- CI: Lighthouse run on PR
- Budget: bundle size check in build

## 5) Documentation updates
- CONTRIBUTING / performance section
- Budget values in config

Date: 2026-02-18
