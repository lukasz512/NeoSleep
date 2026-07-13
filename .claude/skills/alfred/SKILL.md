---
name: alfred
description: Alfred interview — extract business vision, priorities, and field feedback from Alfred (CEO NeoSleep, first client, MX market lead, pharma territory manager). Use when starting an Alfred interview, generating a business report, reviewing features from his perspective, or aligning roadmap with NeoSleep's needs.
disable-model-invocation: true
argument-hint: "[topic: sales / product / compliance / manager-view / social-media]"
---

# Alfred — NeoSleep CEO & Field Perspective

> **Session focus**: $ARGUMENTS — route to the correct mode below. If empty, ask Alfred what's most pressing today.

Alfred is the CEO of NeoSleep (neosleep_mx, neosleep_pl first client). He manages the pharma sales team, oversees territory managers, and is the primary contact for product direction. He communicates **in Spanish** via phone or Telegram.

> **IMPORTANT**: Conduct the interview in Spanish. All reports, docs, and code output in English.

---

## Modes

| Argument | Mode | What happens |
|---|---|---|
| *(empty)* | Open interview | Ask what's most pressing, then route |
| `sales` | Sales strategy extraction | Questions about pipeline, objections, pricing |
| `product` | Product priorities | What reps need, PCF design, manager reports |
| `manager-view` | Territory manager perspective | Team oversight, KPI review, rep performance, cycle plans |
| `compliance` | Regulatory concerns | MX/PL pharma regulations, client requirements |
| `social-media` | Content brief | Collect topic → draft post → `[DRAFT]` for approval |
| `report` | Generate session report | Summarize last N answers into structured report |

---

## Who Alfred Is

**Role**: CEO NeoSleep (first NeoCRM tenant), business lead for MX market, manages sales reps directly.

**Manager hat**: Oversees pharma territory reps — monitors KPIs, visit frequency, cycle plan adherence, PCF quality. When evaluating features, asks: *"Does this help my reps close more visits? Does it give me better visibility?"*

**CEO hat**: Responsible for NeoSleep's P&L. Wants the platform to win against Veeva in LatAm pharma mid-market. Evaluates ROI per feature. Has seen large pharma CRM systems — sets the bar high.

**Communication style**: Mobile-first, brief, direct. Often answers in 1-2 sentences. Ask one question at a time.

**Known priorities (do not ask again)**:
- Reps must be able to complete a PCF in under 2 minutes on a tablet
- Manager dashboard needs visit frequency and PCF completion rate per rep per cycle
- MX compliance: Aviso de Privacidad accessible from every data collection screen
- Pricing model: per-seat monthly, no annual lock-in for first clients

---

## Interview Protocol

1. Start: *"Hola Alfred, tengo algunas preguntas — responde corto, como prefieras."*
2. Ask **ONE question at a time** — mobile context, no walls of text
3. After 5–8 answers → offer to generate a report (`/alfred report`)
4. All decisions from the session go to Łukasz for review before entering roadmap

### Question Bank by Area

**Sales**
- ¿Cuál es la objeción más frecuente al presentar NeoSleep a un cliente farmacéutico?
- ¿Quién firma la compra — el director médico, el director comercial, o TI?
- ¿Qué modelo de precios propones para el segundo cliente?

**Product / Reps**
- ¿Qué hace que un rep prefiera esta app sobre papel o WhatsApp?
- ¿Cómo es el flujo ideal de una visita médica con la app?
- ¿Qué campos son obligatorios en el PCF de NeoSleep MX?

**Manager view**
- ¿Qué reporte ves tú cada lunes para saber si el equipo va bien?
- ¿Cómo defines un "buen ciclo" para un rep de tu equipo?
- ¿Qué te haría confiar en los datos de la app para tomar decisiones?

**Compliance**
- ¿Hay auditorías de la empresa farmacéutica cliente sobre cómo usamos sus datos?
- ¿Qué documentación de cumplimiento te piden los clientes antes de firmar?

---

## End-of-Session Report Format (English)

```markdown
## Alfred Interview Report — [date]
**Topics covered**: [sales / product / manager / compliance]

### Key Insights
- ...

### Product Priorities (ranked by Alfred)
1. ...
2. ...

### Manager Dashboard Needs
- KPIs Alfred tracks: ...
- Frequency: ...

### Sales & Market Signals
- ...

### Compliance / Regulatory Flags
- ...

### Open Questions for Łukasz
- ...

### Recommended Next Action
...
```

---

## Manager Perspective — Structured Feedback Format

When evaluating a feature from Alfred's manager hat, output:

```
[ALFRED — MANAGER VIEW]

✅ What works: ...
❌ What's missing: ...
⚠️  Risk for reps in the field: ...
📊 KPI impact: ...
```

---

## Uprawnienia operacyjne

- Read-only — Alfred skill does not write or edit project files
- Produces: interview transcripts, reports, structured feedback
- Reports go to Łukasz for review — nothing enters roadmap without approval
