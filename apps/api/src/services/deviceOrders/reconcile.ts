/**
 * Device-order reconciliation (NEO-218): do the orders we sent to the lab
 * match what the lab holds now, and what does the lab hold that we never
 * sent? Pure — no I/O. The command (commands/deviceOrderReconciliation.ts)
 * loads both sides and stores the result; the provider adapter supplies the
 * lab's orders in its own wire format plus the paths worth comparing, so
 * nothing here knows OrthoApnea's field names.
 *
 * What counts as a mismatch (needs someone to look):
 *   missing_in_lab   — we hold an id the lab doesn't list any more
 *   field_drift      — a field we sent differs in the lab now
 *   untracked        — the lab has an order tagged by THIS environment we have no link for
 *   submission_pending — a submit whose outcome we don't know yet
 * Information only (explains a count difference, not an error):
 *   test_order, other_env, unknown_env, outside (placed directly in the lab)
 * The lab's status is reported per order and is never a mismatch.
 */

export type DeployEnv = "dev" | "prod" | "local";

export type ReconciliationReason =
  | "matched"
  | "missing_in_lab"
  | "field_drift"
  | "untracked"
  | "submission_pending"
  | "test_order"
  | "other_env"
  | "unknown_env"
  | "outside";

export const MISMATCH_REASONS: readonly ReconciliationReason[] = ["missing_in_lab", "field_drift", "untracked", "submission_pending"];
export const INFO_REASONS: readonly ReconciliationReason[] = ["test_order", "other_env", "unknown_env", "outside"];

/** An order we sent (or tried to): one partner_link row plus the payload we sent. */
export interface LocalOrder {
  treatmentPlanId: string;
  patientId: string | null;
  externalId: string | null;
  syncStatus: "pending" | "synced";
  /** The exact payload of the last create call, in the lab's wire format; null when it never got that far. */
  sentPayload: Record<string, unknown> | null;
}

/** An order as the lab lists it, already mapped by the provider adapter. */
export interface RemoteOrder {
  externalId: string;
  status: string | null;
  requestDate: string | null;
  observations: string;
  /** Shown to admins only; never in the email. */
  patientName: string | null;
  /** The lab's full order, in its wire format — compared at the provider's paths. */
  payload: Record<string, unknown>;
}

export interface FieldDrift {
  field: string;
  ours: string;
  lab: string;
}

export interface ReconciliationItem {
  reason: ReconciliationReason;
  externalId: string | null;
  treatmentPlanId: string | null;
  patientId: string | null;
  patientName: string | null;
  labStatus: string | null;
  requestDate: string | null;
  drift: FieldDrift[];
  /** The environment tag found on a lab-only order, when there is one. */
  tag: EnvTag | null;
}

export interface ReconciliationSummary {
  /** Orders this environment sent (synced + pending). */
  oursSent: number;
  /** Orders the lab lists on the shared account. */
  labTotal: number;
  matched: number;
  mismatches: number;
  info: number;
  byReason: Record<ReconciliationReason, number>;
  /** matched / (matched + mismatches), 0..1; null when there is nothing to compare. */
  matchLevel: number | null;
}

export interface ReconciliationResult {
  status: "ok" | "mismatch";
  summary: ReconciliationSummary;
  items: ReconciliationItem[];
}

export interface ReconcileOptions {
  env: DeployEnv;
  /** Dotted paths into the wire-format payload that are compared (the fields we send). */
  comparedPaths: readonly string[];
  /** Paths compared as dates (first 10 characters only). */
  datePaths?: readonly string[];
}

// ---------------------------------------------------------------------------
// Environment tag — written into the order's free-text notes so a lab-only
// order can be traced back to the environment that sent it (Łukasz Q4).
// ---------------------------------------------------------------------------

export interface EnvTag {
  env: DeployEnv;
  ref: string;
}

const ENV_LABEL: Record<DeployEnv, string> = { dev: "DEV", prod: "PROD", local: "LOCAL" };
const TAG_RE = /\[NeoSleep (DEV|PROD|LOCAL) · ref ([0-9a-f]{8})\]/i;

/** The tag for one order: environment + the first 8 hex digits of our treatment plan id. */
export function formatEnvTag(env: DeployEnv, treatmentPlanId: string): string {
  const ref = treatmentPlanId.replace(/-/g, "").slice(0, 8).toLowerCase();
  return `[NeoSleep ${ENV_LABEL[env]} · ref ${ref}]`;
}

export function parseEnvTag(text: string | null | undefined): EnvTag | null {
  const m = TAG_RE.exec(text ?? "");
  if (!m) return null;
  const env = (Object.keys(ENV_LABEL) as DeployEnv[]).find((k) => ENV_LABEL[k] === m[1]!.toUpperCase());
  return env ? { env, ref: m[2]!.toLowerCase() } : null;
}

/**
 * The note after the tag, so the lab's staff read it as ours and not as an
 * instruction for the device (Łukasz D1, 2026-10-03: "with a note in Spanish").
 */
export const ENV_TAG_NOTE = "referencia interna NeoSleep, no requiere acción";
const TAG_LINE_RE = new RegExp(`\\n?${TAG_RE.source}(?: — ${ENV_TAG_NOTE})?`, "i");

/** Observations with the tag line (tag + note) as the last line, replacing any tag line already there. */
export function withEnvTag(observations: string, env: DeployEnv, treatmentPlanId: string): string {
  const base = observations.replace(TAG_LINE_RE, "").trimEnd();
  const line = `${formatEnvTag(env, treatmentPlanId)} — ${ENV_TAG_NOTE}`;
  return base ? `${base}\n${line}` : line;
}

// Our own test orders: the notes say so ("PEDIDO DE PRUEBA … NO FABRICAR" in NEO-210, "PRUEBA / TEST - por
// favor NO PROCESAR" on 452434, "PRUEBA DEMO" for demos) and the patient is "Tester Patient N" or "patient test".
const TEST_NOTES_RE = /PEDIDO DE PRUEBA|PRUEBA\s*\/\s*TEST|PRUEBA DEMO|\bNO (PROCESAR|FABRICAR)\b/i;
const TEST_PATIENT_RE = /^\s*(Tester Patient\b|patient test\s*$)/i;

export function isTestOrder(remote: Pick<RemoteOrder, "observations" | "patientName">): boolean {
  return TEST_NOTES_RE.test(remote.observations) || TEST_PATIENT_RE.test(remote.patientName ?? "");
}

// ---------------------------------------------------------------------------
// Value comparison — normalised the way the lab normalises what it stores
// (OrthoApnea upper-cases address text; numbers come back as 1.0 for 1).
// ---------------------------------------------------------------------------

function valueAt(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function normalise(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const s = value.trim().replace(/\s+/g, " ").toUpperCase();
    if (s === "") return null;
    const n = Number(s);
    return /^-?\d+(\.\d+)?$/.test(s) && Number.isFinite(n) ? n : s;
  }
  if (Array.isArray(value)) return value.map(normalise);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = normalise((value as Record<string, unknown>)[key]);
      if (v !== null) out[key] = v;
    }
    return Object.keys(out).length === 0 ? null : out;
  }
  return value;
}

function display(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > 200 ? `${s.slice(0, 197)}...` : s;
}

export function compareFields(
  ours: Record<string, unknown>,
  lab: Record<string, unknown>,
  paths: readonly string[],
  datePaths: readonly string[] = []
): FieldDrift[] {
  const drift: FieldDrift[] = [];
  for (const path of paths) {
    let a = valueAt(ours, path);
    let b = valueAt(lab, path);
    if (datePaths.includes(path)) {
      a = typeof a === "string" ? a.slice(0, 10) : a;
      b = typeof b === "string" ? b.slice(0, 10) : b;
    }
    if (JSON.stringify(normalise(a)) !== JSON.stringify(normalise(b))) {
      drift.push({ field: path, ours: display(a), lab: display(b) });
    }
  }
  return drift;
}

// ---------------------------------------------------------------------------

function emptyCounts(): Record<ReconciliationReason, number> {
  return {
    matched: 0,
    missing_in_lab: 0,
    field_drift: 0,
    untracked: 0,
    submission_pending: 0,
    test_order: 0,
    other_env: 0,
    unknown_env: 0,
    outside: 0,
  };
}

function labOnlyReason(remote: RemoteOrder, tag: EnvTag | null, env: DeployEnv): ReconciliationReason {
  if (tag) return tag.env === env ? "untracked" : "other_env";
  if (isTestOrder(remote)) return "test_order";
  // Without a tag only production can tell "placed outside NeoSleep" apart from
  // "sent by another environment before tags existed" (default decided 2026-10-03).
  return env === "prod" ? "outside" : "unknown_env";
}

export function reconcileOrders(ours: readonly LocalOrder[], remote: readonly RemoteOrder[], opts: ReconcileOptions): ReconciliationResult {
  const byId = new Map(remote.map((r) => [r.externalId, r]));
  const claimed = new Set<string>();
  const items: ReconciliationItem[] = [];

  for (const local of ours) {
    const base = {
      treatmentPlanId: local.treatmentPlanId,
      patientId: local.patientId,
      drift: [] as FieldDrift[],
      tag: null,
    };
    if (local.syncStatus === "pending" || !local.externalId) {
      items.push({ ...base, reason: "submission_pending", externalId: local.externalId, patientName: null, labStatus: null, requestDate: null });
      continue;
    }
    const match = byId.get(local.externalId);
    if (!match) {
      items.push({ ...base, reason: "missing_in_lab", externalId: local.externalId, patientName: null, labStatus: null, requestDate: null });
      continue;
    }
    claimed.add(match.externalId);
    const drift = local.sentPayload ? compareFields(local.sentPayload, match.payload, opts.comparedPaths, opts.datePaths) : [];
    items.push({
      ...base,
      reason: drift.length > 0 ? "field_drift" : "matched",
      externalId: match.externalId,
      patientName: match.patientName,
      labStatus: match.status,
      requestDate: match.requestDate,
      drift,
    });
  }

  for (const r of remote) {
    if (claimed.has(r.externalId)) continue;
    const tag = parseEnvTag(r.observations);
    items.push({
      reason: labOnlyReason(r, tag, opts.env),
      externalId: r.externalId,
      treatmentPlanId: null,
      patientId: null,
      patientName: r.patientName,
      labStatus: r.status,
      requestDate: r.requestDate,
      drift: [],
      tag,
    });
  }

  const byReason = emptyCounts();
  for (const item of items) byReason[item.reason] += 1;
  const mismatches = MISMATCH_REASONS.reduce((n, r) => n + byReason[r], 0);
  const info = INFO_REASONS.reduce((n, r) => n + byReason[r], 0);
  const compared = byReason.matched + mismatches;

  return {
    status: mismatches > 0 ? "mismatch" : "ok",
    summary: {
      oursSent: ours.length,
      labTotal: remote.length,
      matched: byReason.matched,
      mismatches,
      info,
      byReason,
      matchLevel: compared === 0 ? null : byReason.matched / compared,
    },
    items,
  };
}
