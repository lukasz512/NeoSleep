/**
 * Live OrthoApnea test order — run by hand, never in CI (NEO-210).
 *
 *   pnpm --filter @neo/api oa:test-order -- --catalog               # read-only: account, products, countries, clinic, min date
 *   pnpm --filter @neo/api oa:test-order -- --shot 1                # dry run: prints the exact JSON + its hash
 *   pnpm --filter @neo/api oa:test-order -- --shot 1 --send <hash>  # sends, only if the plan still has that hash
 *
 * OrthoApnea has no sandbox: every send is a real order on the shared
 * account. The dry run is what Łukasz approves; --send refuses to run when the
 * payload changed since (different hash) or when the shot was already sent.
 * Everything that crosses the wire is written to .claude/local/oa-shots/
 * (gitignored, holds OA ids) and is scrubbed into replica fixtures afterwards.
 *
 * A shot is: create its own patient ("Tester Patient N") → create the order
 * linked to that patient → read the stored order back → diff every key we sent
 * against what OA stored. A rejected order is a result too (that is how we
 * learn OA's error format), so a non-2xx never aborts the recording.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  orthoApneaRawRequest,
  fetchOrthoApneaProducts,
  fetchOrthoApneaClinics,
  fetchCountries,
} from "../src/services/partners/orthoapnea.js";
import { SHOTS, PATIENT_PLACEHOLDER, type ShotContext } from "./oa-test-orders.shots.js";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../.claude/local/oa-shots");
mkdirSync(OUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const argValue = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

type Transport = "json" | "multipart";

interface Recorded {
  method: string;
  path: string;
  transport: Transport | null;
  requestBody: unknown;
  status: number | null;
  headers: Record<string, string>;
  bodyText: string;
  body: unknown;
  error?: string;
  at: string;
}

/**
 * `multipart` is OA's own transport for orders (one form field `treatmentDTO`
 * holding the JSON string, no file parts); `json` is what our app sends today.
 */
async function call(method: string, path: string, body?: unknown, transport: Transport = "json"): Promise<Recorded> {
  const at = new Date().toISOString();
  const usedTransport = body === undefined ? null : transport;
  try {
    let init: RequestInit;
    if (body === undefined) init = { method };
    else if (transport === "multipart") {
      const form = new FormData();
      form.append("treatmentDTO", JSON.stringify(body));
      init = { method, body: form };
    } else init = { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const res = await orthoApneaRawRequest(path, init);
    const bodyText = await res.text();
    let parsed: unknown = null;
    try {
      parsed = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      parsed = null;
    }
    return {
      method,
      path,
      transport: usedTransport,
      requestBody: body ?? null,
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      bodyText: parsed === null ? bodyText.slice(0, 4000) : "",
      body: parsed,
      at,
    };
  } catch (err) {
    return { method, path, transport: usedTransport, requestBody: body ?? null, status: null, headers: {}, bodyText: "", body: null, error: String(err), at };
  }
}

async function resolveContext(): Promise<ShotContext> {
  const [products, clinics, countries] = await Promise.all([fetchOrthoApneaProducts(), fetchOrthoApneaClinics(), fetchCountries()]);
  const me = (await call("GET", "/api/user/me")).body as Record<string, unknown> | null;
  if (!me?.id) throw new Error("could not read the shared account (/api/user/me)");
  const noa = products.find((x) => x.code === "002");
  // Needs productId (400 "Required Integer parameter 'productId'" without it).
  const minDate = noa ? (await call("GET", `/api/products/manufacturingDate?productId=${noa.id}`)).body : null;
  const product = (code: string) => {
    const p = products.find((x) => x.code === code);
    if (!p) throw new Error(`product code ${code} not in OA catalog`);
    return p as unknown as Record<string, unknown>;
  };
  const country = (iso: string) => {
    const c = countries.find((x) => x.code?.toUpperCase() === iso);
    if (!c) throw new Error(`country ${iso} not in OA countries`);
    return c;
  };
  const clinic = clinics[0] as unknown as Record<string, unknown> | undefined;
  if (!clinic) throw new Error("shared OA account has no clinic");
  return { product, country, clinic, me, minDate };
}

const hashOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);

/** Every key we sent, compared with what OA stored — `dropped` is the red flag (OA ignored or renamed it). */
function diffEcho(sent: Record<string, unknown>, stored: Record<string, unknown> | null) {
  const rows: { key: string; sent: unknown; stored: unknown; verdict: "same" | "changed" | "dropped" }[] = [];
  for (const [key, value] of Object.entries(sent)) {
    if (!stored || !(key in stored)) {
      rows.push({ key, sent: value, stored: undefined, verdict: "dropped" });
      continue;
    }
    const same = JSON.stringify(stored[key]) === JSON.stringify(value);
    rows.push({ key, sent: value, stored: stored[key], verdict: same ? "same" : "changed" });
  }
  return rows;
}

function summary(steps: Record<string, unknown>) {
  const pick = (r: unknown) => {
    const rec = r as Recorded | undefined;
    if (!rec) return null;
    const body = rec.body as Record<string, unknown> | null;
    const failed = rec.error ?? (rec.status && rec.status >= 400 ? (rec.body ?? rec.bodyText) : null);
    return { status: rec.status, id: body?.id ?? null, statusId: body?.statusId ?? null, error: failed };
  };
  const echo = (steps.echo as { verdict: string; key: string }[] | undefined) ?? [];
  return {
    patient: pick(steps.createPatient),
    order: pick(steps.createTreatment),
    readBack: pick(steps.readBack),
    droppedKeys: echo.filter((e) => e.verdict === "dropped").map((e) => e.key),
    changedKeys: echo.filter((e) => e.verdict === "changed").map((e) => e.key),
  };
}

async function main() {
  if (args.includes("--catalog")) {
    const me = await call("GET", "/api/user/me");
    const userId = (me.body as { id?: number } | null)?.id;
    const rest = await Promise.all([
      call("GET", "/api/products?page=0&size=1000"),
      call("GET", "/api/countries"),
      call("GET", "/api/products/manufacturingDate?productId=3"),
      call("GET", `/api/clinics?userId=${userId}&deleted=false`),
    ]);
    const file = join(OUT_DIR, "catalog.json");
    writeFileSync(file, JSON.stringify([me, ...rest], null, 2));
    console.log(`catalog written to ${file}`);
    return;
  }

  const n = Number(argValue("--shot"));
  const shot = SHOTS.find((s) => s.n === n);
  if (!shot) throw new Error(`--shot must be one of ${SHOTS.map((s) => s.n).join(", ")}`);

  const ctx = await resolveContext();
  const buildPlan = () => ({
    shot: shot.n,
    purpose: shot.purpose,
    learns: shot.learns,
    transport: shot.transport,
    patient: shot.patient(ctx),
    treatment: shot.treatment(ctx, PATIENT_PLACEHOLDER),
  });
  const plan = buildPlan();
  const hash = hashOf(plan);
  writeFileSync(join(OUT_DIR, `shot-${n}.plan.json`), JSON.stringify({ hash, ...plan }, null, 2));

  const sendHash = argValue("--send");
  if (!sendHash) {
    console.log(JSON.stringify({ hash, ...plan }, null, 2));
    console.log(`\nDRY RUN — nothing sent. To send exactly this: --shot ${n} --send ${hash}`);
    return;
  }
  if (sendHash !== hash) throw new Error(`plan hash is ${hash}, approved was ${sendHash} — payload changed, re-approve`);
  const resultFile = join(OUT_DIR, `shot-${n}.result.json`);
  if (existsSync(resultFile)) throw new Error(`${resultFile} exists — shot ${n} was already sent`);

  const steps: Record<string, unknown> = {};
  const patientRec = await call("POST", "/api/patient", plan.patient);
  steps.createPatient = patientRec;
  const patientId = (patientRec.body as { id?: number } | null)?.id;

  if (patientId != null) {
    const order = shot.treatment(ctx, patientId);
    const orderRec = await call("POST", "/api/treatments", order, shot.transport);
    steps.createTreatment = orderRec;
    const orderId = (orderRec.body as { id?: number } | null)?.id;
    if (orderId != null) {
      const dto = await call("GET", `/api/treatments/DTO/${orderId}`);
      steps.readBack = dto;
      steps.echo = diffEcho(order, dto.body as Record<string, unknown> | null);
    }
  }
  writeFileSync(resultFile, JSON.stringify({ hash, ...plan, steps }, null, 2));
  console.log(`result written to ${resultFile}`);
  console.log(JSON.stringify(summary(steps), null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
