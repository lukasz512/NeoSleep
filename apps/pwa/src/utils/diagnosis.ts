/**
 * patient.diagnosis_code (JSONB, ICD-10 — see migration 003) → one display
 * line. Nothing in the app writes it yet, so this reads the likely shapes
 * leniently: a plain code string, { code, label|description|name }, or
 * { codes: [...] } of either. Null when there is nothing to show (NEO-153).
 */
function one(entry: unknown): string | null {
  if (typeof entry === "string") return entry.trim() || null;
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code.trim() : "";
  const labelSource = record.label ?? record.description ?? record.name;
  const label = typeof labelSource === "string" ? labelSource.trim() : "";
  if (code && label) return `${code} · ${label}`;
  return code || label || null;
}

export function formatDiagnosis(value: unknown): string | null {
  if (value && typeof value === "object" && Array.isArray((value as { codes?: unknown }).codes)) {
    const parts = ((value as { codes: unknown[] }).codes).map(one).filter((p): p is string => !!p);
    return parts.length ? parts.join(", ") : null;
  }
  if (Array.isArray(value)) {
    const parts = value.map(one).filter((p): p is string => !!p);
    return parts.length ? parts.join(", ") : null;
  }
  return one(value);
}
