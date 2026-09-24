/**
 * Pure presentation logic for EntityHistoryPanel.vue's audit timeline: action →
 * icon/color, entity_type → label, audit field diffs → humanized sentences, and
 * day grouping. Same icon/color-mapping convention as hcoLabels.ts/hcpLabels.ts.
 * `action` values come from audit_log rows written by apps/api/src/queries/
 * auditLog.ts (create/update/delete/read/restore); the fields that can ever
 * appear in entity_before/entity_after are bounded by AUDIT_FIELD_ALLOWLIST there.
 */
import type AppIcon from "../components/AppIcon.vue";
import { patientStatusLabel } from "./patientStatus";
import { hcoStatusLabel, hcoTypeLabel } from "./hcoLabels";

type Translate = (key: string, ...params: unknown[]) => string;
type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

export interface HistoryEntryLike {
  action: string;
  entity_type: string;
  entity_before: Record<string, unknown> | null;
  entity_after: Record<string, unknown> | null;
}

export interface HistoryFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** Resolves tenant-configurable lookup codes (specialty) the util can't know statically. */
export interface HistoryValueLookups {
  specialty?: (code: string) => string | undefined;
}

export function historyActionIcon(action: string): AppIconName {
  switch (action) {
    case "create":  return "plus-circle";
    case "update":  return "pencil";
    case "delete":  return "trash";
    case "restore": return "refresh";
    case "read":    return "eye";
    default:        return "info-circle";
  }
}

// A real Vuetify theme color for every case (never the unthemed "default"
// token) — the dot uses the matching `bg-*` class, whose on-color keeps the
// icon legible in both light and dark mode.
export function historyActionColor(action: string): string {
  switch (action) {
    case "create":  return "success";
    case "update":  return "info";
    case "delete":  return "error";
    case "restore": return "warning";
    case "read":    return "secondary";
    default:        return "secondary";
  }
}

function translateOr(t: Translate, key: string, fallback: string, params?: Record<string, unknown>): string {
  const translated = params ? t(key, params) : t(key);
  return translated === key ? fallback : translated;
}

// snake_case DB value → camelCase i18n key segment ("device_shipped" → "deviceShipped").
function camelKey(value: string): string {
  return value.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// `entity_type` is the audit_log row's model name. Falls back to the raw value
// for any type not yet covered here (fail visible, not fail silent).
export function historyEntityTypeLabel(t: Translate, entityType: string): string {
  return translateOr(t, `app.history.entityType.${entityType}`, entityType);
}

/**
 * Sleep studies and treatment plans are the clinical events on a patient's
 * record — everything else (status, territory, profile edits) is administrative.
 * The timeline emphasizes clinical entries so they aren't lost among edits.
 */
const CLINICAL_ENTITY_TYPES: ReadonlySet<string> = new Set(["SleepStudy", "TreatmentPlan"]);

export function isClinicalHistoryEntry(entry: Pick<HistoryEntryLike, "entity_type">): boolean {
  return CLINICAL_ENTITY_TYPES.has(entry.entity_type);
}

// Record identifiers: the entry itself already says which record it's about,
// so a raw UUID "change" carries no meaning for the reader.
const HIDDEN_FIELDS: ReadonlySet<string> = new Set(["id", "patient_id"]);

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/**
 * Field-level changes for one audit entry. Updates list only fields whose value
 * actually differs; creates list the initial values; deletes list the last
 * known values — so every entry states exactly what it did to the record.
 */
export function historyFieldChanges(entry: HistoryEntryLike): HistoryFieldChange[] {
  const before = entry.entity_before ?? {};
  const after = entry.entity_after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !HIDDEN_FIELDS.has(k));

  return keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .filter((k) => !(isEmptyValue(before[k]) && isEmptyValue(after[k])))
    .map((k) => ({ field: k, before: before[k] ?? null, after: after[k] ?? null }));
}

export function historyFieldLabel(t: Translate, field: string): string {
  return translateOr(t, `app.history.field.${field}`, field);
}

/** A stored audit value rendered in the reader's language, never a raw DB code. */
export function historyValueLabel(
  t: Translate,
  entityType: string,
  field: string,
  value: unknown,
  lookups: HistoryValueLookups = {},
): string {
  if (isEmptyValue(value)) return t("app.history.value.empty");
  if (typeof value !== "string") return typeof value === "object" ? JSON.stringify(value) : String(value);

  if (field === "status") {
    switch (entityType) {
      case "Patient":       return patientStatusLabel(t, value);
      case "Organization":  return hcoStatusLabel(t, value);
      case "Practitioner":  return translateOr(t, `user.hcp.filters.status${camelKey(`_${value}`)}`, value);
      case "SleepStudy":    return translateOr(t, `app.sleepStudies.status.${camelKey(value)}`, value);
      case "TreatmentPlan": return translateOr(t, `app.treatmentPlans.status.${camelKey(value)}`, value);
    }
  }
  if (field === "type") {
    if (entityType === "Organization") return hcoTypeLabel(t, value);
    if (entityType === "TreatmentPlan") return translateOr(t, `app.treatmentPlans.type.${camelKey(value)}`, value);
  }
  if (field === "primary_specialty") return lookups.specialty?.(value) ?? value;
  return value;
}

/**
 * One plain-language sentence per entry. A single status change reads as
 * "Sleep study status changed to Device shipped"; everything else as
 * "<record> <action>". Headlines are keyed per entity type and action so each
 * language gets grammatical sentences (Polish noun cases, Spanish word order)
 * instead of a word-glued "Updated SleepStudy".
 */
export function historyHeadline(t: Translate, entry: HistoryEntryLike, lookups: HistoryValueLookups = {}): string {
  const changes = historyFieldChanges(entry);
  if (entry.action === "update" && changes.length === 1 && changes[0].field === "status") {
    const status = historyValueLabel(t, entry.entity_type, "status", changes[0].after, lookups);
    const key = `app.history.statusChanged.${entry.entity_type}`;
    const sentence = translateOr(t, key, "", { status });
    if (sentence) return sentence;
  }
  const fallback = `${translateOr(t, `app.history.action.${entry.action}`, entry.action)} ${historyEntityTypeLabel(t, entry.entity_type)}`;
  return translateOr(t, `app.history.headline.${entry.entity_type}.${entry.action}`, fallback);
}

/** Whether the headline already states the entry's only change (no need to repeat it inline). */
export function historyHeadlineCoversChanges(entry: HistoryEntryLike): boolean {
  const changes = historyFieldChanges(entry);
  return entry.action === "update" && changes.length === 1 && changes[0].field === "status";
}

export interface HistoryDayGroup<T> {
  /** Local calendar day, YYYY-MM-DD — stable key for rendering. */
  key: string;
  date: Date;
  entries: T[];
}

function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Groups entries by the reader's local calendar day, preserving input order. */
export function groupHistoryByDay<T extends { created_at: string }>(entries: T[]): HistoryDayGroup<T>[] {
  const groups: HistoryDayGroup<T>[] = [];
  for (const entry of entries) {
    const date = new Date(entry.created_at);
    const key = localDayKey(date);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.entries.push(entry);
    else groups.push({ key, date, entries: [entry] });
  }
  return groups;
}

export function historyDayLabel(t: Translate, date: Date, now: Date, locale: string): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (localDayKey(date) === localDayKey(now)) return t("app.history.today");
  if (localDayKey(date) === localDayKey(yesterday)) return t("app.history.yesterday");
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}
