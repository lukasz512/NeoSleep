# NeoSleep — Certifications & Compliance Readiness

Track for certifications relevant to medical SaaS and pharma sales. Updated as requirements evolve.

---

## 1. WCAG 2.1 AA — Web Accessibility (Do Now)

**What it is:** EU legal requirement (European Accessibility Act, effective June 2025). Medical sites have higher obligations.
**Target:** AA compliance minimum.
**Status:** Mostly compliant — known gaps listed below.

### Current audit (March 2026)

| Area | Status | Finding |
|------|--------|---------|
| Touch targets ≥ 44px | ✅ | `.home-btn` has `min-height: 52px` |
| Color contrast ≥ 4.5:1 | ✅ | Teal `#128F83` on white = ~4.6:1 ✅ |
| Decorative images `alt=""` | ✅ | All hero/section photos have `alt=""` |
| Icon-only buttons `aria-label` | ⚠️ | ThemeToggle, LanguageSelect — verify aria-labels |
| `prefers-reduced-motion` | ❌ | Animations (hero-content-in, home-reveal-in, shimmer) don't pause for users who prefer reduced motion |
| Skip navigation link | ❌ | No `<a href="#main">Skip to content</a>` as first focusable element |
| Semantic landmarks | ✅ | `<nav>`, `<main>`, `<footer>`, `<header>` used correctly |
| Form labels | ✅ | ContactForm uses label-bound inputs |
| Focus visible | ⚠️ | Verify focus ring not hidden by `outline: none` anywhere |
| Zoom to 200% | ✅ | Fluid typography with `clamp()`, no fixed px breakpoints |

### Required fixes before HONcode / public launch

- [ ] Add `@media (prefers-reduced-motion: reduce)` to all CSS animations in `website-theme.scss` and component styles
- [ ] Add skip-to-main link in `DefaultLayout.vue`
- [ ] Audit `ThemeToggle.vue` and `LanguageSelect.vue` for `aria-label`
- [ ] Audit focus ring visibility in `DefaultHeader.vue`

---

## 2. HONcode — Health On the Net (Before content finalization)

**What it is:** The gold standard trust certification for medical websites. Issued by the Health On the Net Foundation (Geneva, Switzerland).
**What it gives:** "HON Certified" badge — visible trust signal for patients and B2B partners.
**Cost:** Free for non-commercial; ~300–500 EUR/year for commercial sites.
**Timeline:** 1–4 weeks for review after application.
**Apply at:** https://www.hon.ch/HONcode/Conduct.html

### 8 HONcode Principles — readiness checklist

| # | Principle | NeoSleep Status | Action needed |
|---|-----------|----------------|---------------|
| 1 | **Authority** — medical advice given only by qualified professionals | ⚠️ | Add author credentials to medical content pages |
| 2 | **Complementarity** — information supplements, not replaces, doctor | ✅ | Already in copy ("consult a specialist") |
| 3 | **Privacy** — patient data protected | ✅ | GDPR compliant, PrivacyView exists |
| 4 | **Attribution** — sources cited, dates visible | ❌ | Add publication dates + source citations to medical content |
| 5 | **Justifiability** — claims backed by evidence, balanced | ⚠️ | Review statistics in HomeStats and testimonials |
| 6 | **Transparency** — contact address listed | ⚠️ | Ensure physical address + contact email in footer |
| 7 | **Financial disclosure** — funding/sponsorship disclosed | ❌ | Add brief sponsor/owner disclosure (can be in footer or About) |
| 8 | **Advertising separation** — ads clearly labeled | ✅ | No ads currently |

### Required before application

- [ ] Add publication date meta to pages with medical claims
- [ ] Add physical company address to footer
- [ ] Add brief "About this site" / funding disclosure
- [ ] Add medical credentials to any doctor/specialist quoted
- [ ] Final legal review of all health claims on ForPatientsView

---

## 3. ISO 27001 — Information Security Management (12–18 months out)

**What it is:** International standard for information security management systems (ISMS). Required by most large pharma enterprises.
**Cost:** ~20,000–60,000 EUR (gap analysis + implementation + external audit).
**Timeline:** 6–18 months from decision to certification.
**Why pharma needs it:** Proof that patient and HCP data is handled with documented security controls.

### Gap analysis checklist (current state)

#### Organizational controls
- [ ] Information security policy (written + approved by leadership)
- [ ] Asset inventory (all systems, databases, repos documented)
- [ ] Risk assessment and treatment plan
- [ ] Roles and responsibilities documented
- [ ] Security awareness training for all staff

#### Technical controls
- [ ] Access control policy (principle of least privilege)
- [ ] MFA enforced for all admin access ← verify current GoDaddy / VPS access
- [ ] Secrets management (no secrets in git) ← `.env.example` exists, verify `.env` is gitignored
- [ ] Encryption at rest (PostgreSQL, backups)
- [ ] Encryption in transit (HTTPS everywhere, HSTS header)
- [ ] Vulnerability management / dependency scanning (Dependabot or similar)
- [ ] Penetration test before each major release
- [ ] Audit logging — `audit_log` table exists ✅
- [ ] Backup policy (frequency, retention, test restore)
- [ ] Incident response plan (who does what when breached)

#### Third-party / supplier controls
- [ ] Data Processing Agreements (DPA) with: hosting provider, email provider, any analytics
- [ ] Vendor security assessment for critical suppliers

#### Physical controls
- [ ] Office / remote work clean desk policy
- [ ] Device management (laptops encrypted, remote wipe capable)

### Recommended path

1. **Now**: Document what exists (architecture, auth flows, data flows) → already partially in `docs/SECURITY_MODEL.md`
2. **Q3 2026**: Formal gap analysis with ISO consultant
3. **Q4 2026**: Implement missing controls
4. **Q1 2027**: Internal audit
5. **Q2 2027**: External certification audit (UKAS/DAKKS accredited body)

---

## 4. MDR — EU Medical Device Regulation 2017/745 (Manufacturer path — TRIGGERED)

**Decision (2026-09-20):** NeoSleep will design and sell its own branded sleep/mandibular devices, not only resell third-party CE-marked devices.

**What this changes:** Two separate MDR triggers exist and must be tracked separately —

| Trigger | Status | Note |
|---|---|---|
| Own-brand physical device manufacturing | ✅ Triggered — 2026-09-20 decision | Makes NeoSleep the "manufacturer" under MDR Art. 2(30), independent of any software feature |
| Software as a Medical Device (SaMD) — e.g. AI diagnosis/symptom scoring | ⬜ Not triggered | Revisit before building any clinical decision-support feature (see skill for trigger conditions) |

Building the own-brand device is now a roadmap item, not a "watch and see" risk.

### Companion standards required (manufacturer path)

- [ ] **ISO 13485** — Quality Management System for medical device manufacturers. Near-mandatory prerequisite for MDR CE marking; get this gap-analyzed alongside ISO 27001 to share audit/documentation overhead.
- [ ] **IEC 62304** — software lifecycle requirements, required if the device ships with embedded or companion software (firmware, companion app, Bluetooth pairing, etc.)
- [ ] **ISO 14971** — risk management process for medical devices (hazard analysis, risk control, post-market surveillance)
- [ ] Technical documentation file (MDR Annex II/III), UDI (Unique Device Identification) registration
- [ ] Notified Body involvement — required for Class IIa and above; self-certification may be possible only for Class I

### Action required

- [ ] Classify the device (Class I / IIa / IIb) with an MDR regulatory consultant — this determines self-certification vs. Notified Body audit
- [ ] Legal/regulatory scoping session before finalizing device specs or committing to a launch date
- [ ] Do not use diagnostic/treatment language in marketing or product copy until device classification + CE marking is obtained
- [ ] Budget and timeline for this track are materially larger than the software-only (SaMD) path — get consultant estimates before roadmap commitments

---

## 5. SOC 2 Type II (US market gate)

**What it is:** Audit opinion (Type II = controls tested over an observation period, not a point-in-time snapshot) covering the AICPA Trust Service Criteria. US enterprises generally prefer this over ISO 27001.
**When needed:** First US pharma client in scope, or first US-based device distribution partner.
**Cost:** 30,000–80,000 USD; 6–12 month observation period + audit.
**Status:** Not started.

Prep now, cheaply:
- [ ] All production access logged
- [ ] All admin actions go through `audit_log`
- [ ] Documented change management (PR → review → deploy)
- [ ] Uptime monitoring + SLA tracking

---

## 6. HIPAA (US market gate)

**Status:** Not applicable today — no US patients or providers in scope.
**When needed:** First US pharma customer, or first US patient/device-user data enters the system.
**Cost:** 50,000–150,000 USD.
**Note:** Roughly 60% of controls overlap with ISO 27001; roughly 40% of the technical safeguards are satisfied as a side effect of FHIR Phase 2/3 (FHIR AuditEvent + SMART on FHIR) — see [docs/fhir-compliance.md](./fhir-compliance.md).

---

## 7. Additional standards to track

Lower priority than the sections above — surface these when the relevant market/decision materializes, don't gap-analyze all at once.

| Standard | What it covers | Why relevant to NeoSleep | Trigger |
|---|---|---|---|
| **ISO 27701 (PIMS)** | Privacy Information Management, extends ISO 27001 | Direct evidence of GDPR + LFPDPPP compliance in one certification; small marginal cost on top of the ISO 27001 program already planned | Bundle with ISO 27001 gap analysis (Q3 2026) |
| **ISO 27018** | Protection of PII in public cloud | DB is hosted on Supabase (shared cloud infra) — pharma security questionnaires ask about this regardless of ISO 27001 status | Bundle with ISO 27001/27701 |
| **HITRUST CSF** | US healthcare-specific security framework | Some large US healthcare orgs/payers require HITRUST instead of, or in addition to, SOC 2/HIPAA self-attestation | Evaluate at first US enterprise prospect — don't start speculatively |
| **NOM-024-SSA3** | Mexican health information interoperability standard | MX is an **active** market (not just planned) — needs a legal check on whether this is mandatory for systems handling HCP/patient data in Mexico | Legal review — should happen soon, MX is live |
| **PCI DSS** | Payment card data security | `purchase_order` handles patient payments via Stripe (`stripe_payment_intent_id`) — if card data never touches our backend (Stripe Checkout/Elements), scope is the lightweight SAQ-A; verify this assumption in the payment integration | Verify current Stripe integration flow now — cheap to confirm, expensive to discover wrong |

---

## References

- WCAG 2.1 Quick Reference: https://www.w3.org/WAI/WCAG21/quickref/
- HONcode application: https://www.hon.ch/HONcode/Conduct.html
- ISO 27001:2022 overview: https://www.iso.org/isoiec-27001-information-security.html
- EU EAA (European Accessibility Act): https://ec.europa.eu/social/main.jsp?catId=1202
- EU MDR 2017/745 overview: https://health.ec.europa.eu/medical-devices-sector_en
- ISO 13485:2016 overview: https://www.iso.org/standard/59752.html
