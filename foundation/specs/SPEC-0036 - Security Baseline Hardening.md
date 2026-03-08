# SPEC-0036: Security Baseline Hardening

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: bff  
Milestone: Phase 2

## 1) Goal
Prevent common SaaS vulnerabilities in the BFF.

## 2) Requirements
- Rate limiting middleware
- CSRF protection
- Content Security Policy
- Helmet headers
- Dependency vulnerability scan

## 3) DoD
- Security middleware active
- OWASP basic checklist satisfied

## 4) Test plan
- Integration: rate limit returns 429
- Headers present (CSP, Helmet)
- CI: npm audit / similar in pipeline

## 5) Documentation updates
- SECURITY_MODEL
- Runbook: security middleware config

Date: 2026-02-18
