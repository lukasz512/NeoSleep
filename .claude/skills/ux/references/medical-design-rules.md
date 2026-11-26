# Medical UX Design Rules — NeoSleep

Rules specific to designing for healthcare and sleep medicine context. These go beyond standard UX principles — the medical domain has unique requirements for trust, clarity, and emotional tone.

---

## 1. Trust Architecture

Medical products earn trust through design signals. Every page must carry at least one trust anchor:

| Trust signal | Where to use | Example |
|---|---|---|
| Clinical statistics | Hero sections, above fold | "89% of patients report improvement in 8 weeks" |
| Professional credentials | About, For Professionals | "Recommended by sleep specialists" |
| Partner logos | Home, B2B sections | Pharma partner logos |
| Testimonials | Patient pages | Real patient quotes |
| Regulatory markers | Footer, Privacy | "GDPR compliant", "ISO 27001" (when obtained) |
| Transparent process | Patient flows | "How it works" 3-step sections |

**Rule:** If a page asks the user to take an action (contact, sign up, book), a trust signal must appear **before** the CTA, not after.

---

## 2. Emotional Register by Audience

### For patients (B2C)
- They are often anxious, sleep-deprived, or caring for someone sick
- Language: warm, empathetic, simple — avoid jargon
- Design: soft, spacious, calm — not clinical sterility or startup energy
- Imagery: real people, natural light, sleep contexts (not lab equipment)
- Never use alarming language about health consequences unprompted
- Always offer a clear, low-friction next step — the patient should feel helped, not overwhelmed

### For pharma decision-makers (B2B)
- They are analytical, skeptical, process-oriented
- Language: specific, data-driven, professional — avoid vague "disruption" language
- Design: sharp, precise, high information density is acceptable
- Social proof: ROI metrics, case studies, client logos matter more than testimonials
- They need to justify the decision internally — give them numbers they can share

### For HCPs (future portal)
- They are time-constrained, expert, evidence-driven
- Language: clinical, accurate, no dumbing-down
- Design: efficiency over beauty — information density is a feature
- Must not look like a patient app (undermines professional credibility)

---

## 3. Color and Contrast in Medical Context

- Teal (`--website-primary`) = trustworthy, calm, medical — appropriate for primary actions
- Green: careful — patients may associate with "healthy/normal". Use only for success states.
- Red: reserve **exclusively** for errors and critical warnings. Never decorative.
- Yellow/orange: caution states only. Never in the main palette.
- White space is not wasted space — density signals anxiety in healthcare UI

**Contrast minimums:**
- Body text: 4.5:1 (WCAG AA) — **enforce always**
- Large headings (≥18px bold or ≥24px): 3:1 minimum, target 4.5:1
- Interactive elements (buttons, links): 3:1 against background minimum
- Never rely on color alone for meaning (colorblind users exist, medical stakes are high)

---

## 4. Copy Rules for Healthcare

### What to say
- Lead with the patient benefit, not the product feature
  - ✅ "Sleep better in 8 weeks"
  - ❌ "AI-powered sleep monitoring dashboard"
- Use plain language (7th-grade reading level for patient copy)
- Specific numbers > vague claims ("89% improvement" > "most patients improve")
- Explain the process — uncertainty is anxiety-inducing in healthcare

### What NOT to say
- Never make diagnostic claims ("NeoSleep will cure your sleep apnea")
- Never guarantee outcomes ("you will sleep better")
- No urgency tactics that exploit anxiety ("don't wait — your health is at risk!")
- No dark patterns on consent (pre-checked boxes, buried opt-outs)
- Avoid: "revolutionary", "game-changing", "disrupting healthcare" — sounds hollow

### CTAs
- Patient CTAs: low friction — "Find a specialist", "Learn more", "Talk to someone"
- B2B CTAs: commitment-aware — "Request a demo", "Download case study", "Schedule a call"
- Avoid: "Sign up now", "Buy now" — too transactional for health context

---

## 5. Accessibility in Healthcare

Healthcare users have higher rates of disability than the general population (visual impairment, motor issues, cognitive load from illness or medication). Accessibility is not optional:

### Vision
- Minimum 4.5:1 contrast everywhere (no exceptions for "decorative" text)
- Never convey information with color only (also use icons, labels, patterns)
- All images have meaningful `alt` text or `aria-hidden="true"` if decorative
- Body text ≥ 16px. Never below 14px except footnotes.
- Support browser zoom to 200% without horizontal scrolling

### Motor
- Touch targets ≥ 44×44px (all interactive elements)
- Adequate spacing between targets (≥ 8px gap on touch, ≥ 4px on desktop)
- No hover-only interactions (mobile users have no hover)
- No time-limited interactions unless medically necessary

### Cognitive
- One primary action per screen
- Progress indicators on multi-step forms
- Never auto-submit forms
- Confirmation step before irreversible actions
- Error messages say what happened AND what to do

### Screen readers
- Every `<input>` has an associated `<label>` (not just placeholder text)
- Icon-only buttons have `aria-label`
- Modals trap focus and return it on close (`aria-modal="true"`, focus trap)
- Skip navigation link as first focusable element on each page
- Landmark roles: `<nav>`, `<main>`, `<footer>`, `<header>` used correctly

---

## 6. Empty States in Healthcare Context

Empty states are moments of high anxiety — the user expected to see something and didn't. In a medical product this is worse than in a todo app.

### Rule: every empty state needs 3 things
1. **Visual** — icon or illustration (not a blank white box)
2. **Explanation** — why is it empty? (honest, not vague)
3. **Next action** — what can the user do?

### Examples for NeoSleep

**Find Specialist — no results in area:**
- ❌ "No specialists found."
- ✅ Icon + "We're growing our specialist network in your area." + "Leave your contact — we'll notify you when a specialist is available near you" + [Contact us] button

**Rep App — no HCPs in territory:**
- ❌ Empty list
- ✅ Icon + "Your territory hasn't been configured yet." + "Contact your manager to set up your territory" + [manager contact button]

**Leads list — no leads:**
- ❌ Empty list
- ✅ Icon + "No leads yet." + "Leads appear here after HCPs express interest in a presentation" + [How to generate leads →]

---

## 7. Loading States in Healthcare

Medical data that loads slowly feels broken. Users may assume their information is missing, not loading.

- **< 200ms**: no loader needed (appears instantaneous)
- **200ms – 1s**: skeleton screens (same shape as the content that's coming)
- **1s – 3s**: spinner + short message ("Loading your schedule...")
- **> 3s**: progress indicator + estimated time if possible, or partial load

Skeleton screens > spinners for content-heavy views (HCP list, patient list, planner).
Spinners OK for single-action responses (form submit, button action).

---

## 8. Multi-Tenant White-Label Considerations

NeoSleep will be licensed to multiple pharma companies. UX decisions must scale:

- **Never hardcode pharma company names** in UI copy or component logic — always use tenant config
- **Tenant-changeable**: logo, primary color, tenant name, product name
- **Not tenant-changeable**: layout, component structure, accessibility rules, content patterns
- **Test every new screen with a hypothetical second color palette** — if it only looks good in NeoSleep teal, it's not white-label ready
- **Privacy and legal copy** must be tenant-parameterizable (company name, DPO contact, jurisdiction)
- **Imagery**: avoid images that embed brand colors or logos — assets must be palette-agnostic or swappable

---

## 9. Pre-Release UX Checklist

Before any view is marked done:

- [ ] All states handled: empty, loading, error, success, disabled
- [ ] Works at 375px (mobile), 768px (tablet), 1280px (desktop)
- [ ] Works in light AND dark mode
- [ ] All text uses i18n keys (no hardcoded strings)
- [ ] Contrast ≥ 4.5:1 on all text
- [ ] Touch targets ≥ 44px
- [ ] Every input has a label
- [ ] Every icon-only button has aria-label
- [ ] No diagnostic or outcome guarantees in copy
- [ ] At least one trust signal visible before the CTA
- [ ] CTA is the most visually dominant interactive element
- [ ] Tested with browser zoom at 150% and 200%
- [ ] Animations respect `prefers-reduced-motion`
