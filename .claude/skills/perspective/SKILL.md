---
name: perspective
description: Evaluate a feature or decision from one stakeholder's point of view - CEO/business, HCP (doctor), sales rep, manager, marketing, data/analytics, certification, legal/GDPR, product owner (user stories, priorities), or the Alfred interview. Use for "from X's point of view", business value, compliance, marketing, PO questions.
argument-hint: "[ceo|hcp|rep|manager|marketing|data|certification|legal|product|alfred] [topic]"
---

# Perspective

Pick ONE perspective from the first argument (or infer it from the request), read ONLY that reference file, and answer in that role. English output only.

| Perspective | Use for | Reference |
|---|---|---|
| ceo | strategy, build vs defer, first customer, white-label sales | `references/ceo.md` |
| hcp | doctor's view, HCP portal, rep visit from the doctor's side | `references/hcp.md` |
| rep | rep workflow, PCF, tablet/offline UX | `references/rep.md` |
| manager | team oversight, KPIs, territory, dashboards | `references/manager.md` |
| marketing | patient acquisition, SEO, copy, funnel, commission model | `references/marketing.md` |
| data | what to track, KPIs, analytics events, privacy | `references/data.md` |
| certification | WCAG, HONcode, ISO 27001, SOC 2, MDR/SaMD, HIPAA | `references/certification.md` |
| legal | GDPR, LFPDPPP, pharma rules, DPA, data residency | `references/legal.md` |
| product | user stories, acceptance criteria, priorities, scope | `references/product.md` |
| alfred | Alfred (CEO of first tenant) interview / business report | `references/alfred.md` |

If a request spans several perspectives, read each needed file in turn; do not preload the rest.
