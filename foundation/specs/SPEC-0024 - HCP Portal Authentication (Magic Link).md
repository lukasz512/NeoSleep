# SPEC-0024: HCP Portal Authentication (Magic Link)

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: client, bff  
Milestone: Phase 2

## 1) Goal
Allow HCP login via email magic link.

## 2) User story
As an HCP, I want to log in with a link sent to my email so that I can access my documents without a password.

## 3) UX flow
- HCP enters email
- Receives magic link
- Link expires after X minutes
- Token stored httpOnly

## 4) Security
- Single-use tokens
- IP + user agent logging

## 5) Acceptance criteria
- Expired link rejected
- Replay attack rejected
- Session cookie httpOnly

## 6) Test plan
- Expired link rejected
- Replay attack rejected
- Single-use token invalidated after use

## 7) Documentation updates
- HCP portal auth flow
- Security model (SECURITY_MODEL.md)

Date: 2026-02-18
