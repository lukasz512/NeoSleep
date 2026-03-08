# SPEC-0030: Self-Improvement Loop (AI Planning Engine)

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: bff  
Milestone: Phase 2

## 1) Goal
Use accumulated events and rep questions to suggest roadmap improvements.

## 2) User story
As product/ops, I want monthly suggestions (pain points, automations, feature flags) so that we can improve without manual analysis only.

## 3) Flow
- Monthly aggregation (events + rep questions, anonymized)
- OpenRouter summarization
- Generate: top pain points, suggested automations, suggested feature flags
- Save to Notion, tagged by module
- No sensitive content exposed

## 4) Data & API
- BFF or cron triggers aggregation
- OpenRouter call with redacted input
- Output written to Notion (or email)

## 5) Acceptance criteria
- Suggestions saved to Notion
- Tagged by module
- No sensitive content exposed

## 6) Test plan
- Unit: aggregation and redaction
- Integration: mock OpenRouter, Notion write
- Redaction verification (no PII in prompt)

## 7) Documentation updates
- AI hub / insights pipeline
- Notion schema for suggestions

Date: 2026-02-18
