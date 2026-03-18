# SPEC-0007: Email Engine

Status: Draft
Apps/Modules: bff
Milestone: MVP

## Goal
Send localized transactional emails.

## Requirements
- Provider (Postmark/Mailgun/SendGrid)
- MJML templates
- Handlebars variables
- Per-tenant branding
- SPF/DKIM/DMARC checklist

## First template
- magic link
- internal notification

## Tests
- Render MJML → HTML
- Send mock email