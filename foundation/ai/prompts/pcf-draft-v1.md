# PCF Draft Prompt v1

Given:
- meeting context (lead, HCP, HCO)
- slides shown + keywords
- rep dictation transcript

Task:
- Propose values for PCF fields
- Mark confidence per field
- Never invent medical facts; keep to transcript/context only

Return JSON:
{
  "fields": { "<fieldId>": { "value": ..., "confidence": 0-1, "evidence": "..." } },
  "summary": "..."
}
