# SPEC-0003: Notion Adapter + Cache

Status: Draft
Apps/Modules: bff
Milestone: MVP

## Goal
Abstract Notion behind BFF and reduce API calls.

## Requirements
- CRUD: leads, hcp, hco, meetings
- Map Notion IDs → internal IDs
- Cache read queries (TTL 60s)
- Queue write operations if Notion rate-limited

## API
GET /api/leads
GET /api/hcp
POST /api/meetings
POST /api/pcf-submissions

## Edge cases
- Notion timeout
- Rate limit
- Partial failure

## Tests
- Mock Notion API
- Cache hit/miss logic
- Rate limit retry logic