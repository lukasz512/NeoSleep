import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * In-process, stateful replica of the OrthoApnea (apneadock.es) endpoints the
 * device-order flow uses — built from the scrubbed live captures in
 * ./fixtures (NEO-210 shots, 2026-10-03). Specs point the service at it with
 * __setOrthoApneaBaseUrlForTests(replica.url); nothing here ever talks to the
 * real OrthoApnea.
 *
 * What it reproduces, and from where:
 * - POST /api/login: Basic auth → `{ token }` (a JWT-shaped string with exp), as login() expects.
 * - Bearer check on every other path; an unknown token is 403, not 401 (verified 2026-09-25).
 * - GET /api/user/me, /api/clinics, /api/countries, /api/products, /api/products/manufacturingDate
 *   (400 Spring Boot body without productId — fixtures/error-missing-param.response.json).
 * - POST /api/patient (JSON) → stored with an id; GET /api/patient/:id reads it back.
 * - POST /api/treatments: multipart with a `treatmentDTO` text field only. A JSON
 *   body gets 415 — our judgement of what OA's Spring @RequestPart endpoint does
 *   (never tried live, rules §9.1). Requires the patientId of a stored patient.
 *   Answers like fixtures/treatment-create-full.response.json: statusId 1, server
 *   requestDate/lastActivity, upper-cased delivery name/address/city, `patient` object,
 *   total 459 (+148 with morningAligner).
 * - GET /api/treatments/DTO/:id, POST /api/notifications.
 * - GET /api/treatments/byPatient/:oaPatientId?page=&size=: a Spring page
 *   `{ content: [<full treatment DTO>], totalElements, totalPages, … }` filtered
 *   by patientId (live shape read 2026-10-03). requestDate is OA's server
 *   local time (Europe/Madrid), zone-less, like the real one.
 */

const FIXTURES = new URL("./fixtures/", import.meta.url);

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), "utf-8")) as T;
}

type Json = Record<string, unknown>;

export interface ReplicaRequest {
  method: string;
  path: string;
  contentType: string | null;
  /** Parsed JSON body, or for a multipart treatment the parsed `treatmentDTO`. */
  body: unknown;
}

export interface OaReplica {
  url: string;
  /** Every request received, in order (login included). */
  requests: ReplicaRequest[];
  /** Stored patients and treatments by id. */
  patients: Map<number, Json>;
  treatments: Map<number, Json>;
  /** The next request to `path` (exact path, no query) answers `status` with `body` (default: a Spring error body). */
  failNext(path: string, status: number, body?: unknown): void;
  /** The next request (any path) waits `ms` before it is handled. */
  delayNext(ms: number): void;
  /** Clears stored data, the request log and pending failures/delays. */
  reset(): void;
  /** Requests to one method + path (no query). */
  count(method: string, path: string): number;
  /**
   * Stores an order that never came through our API — one "placed directly in
   * OA" (NEO-218). Starts from the captured accepted order; returns its id.
   */
  seedTreatment(overrides?: Json): number;
  close(): Promise<void>;
}

/** NOA's product object as captured in the accepted order (no product-list fixture was recorded). */
const NOA_PRODUCT = (fixture<Json>("treatment-create-full.request.json").product as Json);
/** NOA TMJ: only the keys our code reads; id is a placeholder, OA's real one was never captured. */
const NOA_TMJ_PRODUCT: Json = { id: 9003, code: "003", nameEs: "NOA TMJ", category: "APNEA_SNORE", manufacturingDays: 10 };

const CLINICS = fixture<Json[]>("clinics.response.json");
const COUNTRIES = fixture<Json[]>("countries.response.json");
const TREATMENT_RESPONSE = fixture<Json>("treatment-create-full.response.json");
const PATIENT_RESPONSE = fixture<Json>("patient-create.response.json");
const SHARED_USER = PATIENT_RESPONSE.user as Json;

/** GET /api/user/me. Not captured whole; rebuilt from the captured order (customerId/customerName, user id, fsDoctorId). */
const ME: Json = {
  id: 15682,
  name: SHARED_USER.name,
  email: SHARED_USER.email,
  role: "ROLE_DOCTOR",
  fsDoctorId: 46355,
  customers: [{ id: 20796, name: "SHARED ACCOUNT DOCTOR", countryId: 29, paymentOption: 6 }],
};

/** Keys OA overwrites instead of storing what was sent (rules "Results 2026-10-03", item 4). */
const SERVER_OWNED_KEYS = new Set([
  "id", "user", "creator", "statusId", "lastActivity", "requestDate", "multimedias", "customerCountryId", "parentTreatmentId",
]);

function springError(status: number, error: string, message: string, path: string): Json {
  return { timestamp: new Date().toISOString().replace("Z", "+0000"), status, error, message, path: `/apneadock${path}` };
}

function jwt(nonce: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 12 * 3600, n: nonce })).toString("base64url");
  return `header.${payload}.signature`;
}

/**
 * OA's server clock: local Spanish time with no zone, as OA writes requestDate
 * (shot S3: 17:33:13.049 stored for a request sent at 15:33:12.8Z).
 */
function serverNow(): string {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Madrid",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${ms}`;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function startOaReplica(): Promise<OaReplica> {
  const validTokens = new Set<string>();
  const failures = new Map<string, { status: number; body: unknown }>();
  let pendingDelayMs = 0;
  let nextPatientId = 44200;
  let nextTreatmentId = 454100;

  const send = (res: ServerResponse, status: number, body?: unknown) => {
    if (body === undefined) {
      res.writeHead(status).end();
      return;
    }
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const replica: OaReplica = {
    url: "",
    requests: [],
    patients: new Map(),
    treatments: new Map(),
    failNext(path, status, body) {
      failures.set(path, { status, body: body ?? springError(status, "Error", "replica: forced failure", path) });
    },
    delayNext(ms) {
      pendingDelayMs = ms;
    },
    reset() {
      replica.requests.length = 0;
      replica.patients.clear();
      replica.treatments.clear();
      failures.clear();
      pendingDelayMs = 0;
    },
    count(method, path) {
      return replica.requests.filter((r) => r.method === method && r.path === path).length;
    },
    seedTreatment(overrides = {}) {
      const id = nextTreatmentId++;
      replica.treatments.set(id, { ...TREATMENT_RESPONSE, statusId: 1, requestDate: serverNow(), lastActivity: serverNow(), ...overrides, id });
      return id;
    },
    close: async () => {},
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://replica.local");
    const path = url.pathname;
    const method = req.method ?? "GET";
    const contentType = req.headers["content-type"] ?? null;
    const raw = await readBody(req);

    let body: unknown = null;
    let multipartDto: string | null = null;
    if (contentType?.startsWith("multipart/form-data")) {
      const form = await new Response(new Uint8Array(raw), { headers: { "content-type": contentType } }).formData();
      const field = form.get("treatmentDTO");
      multipartDto = typeof field === "string" ? field : null;
      body = multipartDto !== null ? (JSON.parse(multipartDto) as unknown) : null;
    } else if (raw.length > 0 && contentType?.includes("application/json")) {
      body = JSON.parse(raw.toString("utf-8")) as unknown;
    }
    replica.requests.push({ method, path, contentType, body });

    if (pendingDelayMs > 0) {
      const ms = pendingDelayMs;
      pendingDelayMs = 0;
      await new Promise((resolve) => setTimeout(resolve, ms));
    }

    if (method === "POST" && path === "/api/login") {
      const auth = req.headers.authorization ?? "";
      const decoded = auth.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString("utf-8") : "";
      if (!decoded.includes(":") || decoded.endsWith(":")) return send(res, 401);
      const token = jwt(validTokens.size + 1);
      validTokens.add(token);
      return send(res, 200, { token, roles: [{ authority: "ROLE_DOCTOR" }], userId: ME.id });
    }

    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (!validTokens.has(token)) return send(res, 403);

    const forced = failures.get(path);
    if (forced) {
      failures.delete(path);
      return send(res, forced.status, forced.body);
    }

    if (method === "GET" && path === "/api/user/me") return send(res, 200, ME);
    if (method === "GET" && path === "/api/clinics") return send(res, 200, CLINICS);
    if (method === "GET" && path === "/api/countries") return send(res, 200, COUNTRIES);
    if (method === "GET" && path === "/api/products") return send(res, 200, { content: [NOA_PRODUCT, NOA_TMJ_PRODUCT] });
    if (method === "GET" && path === "/api/products/manufacturingDate") {
      const productId = url.searchParams.get("productId");
      if (!productId) return send(res, 400, fixture<Json>("error-missing-param.response.json"));
      const product = [NOA_PRODUCT, NOA_TMJ_PRODUCT].find((p) => String(p.id) === productId);
      const days = typeof product?.manufacturingDays === "number" ? product.manufacturingDays : 10;
      // OA counts working days; calendar days + weekend slack is close enough for a replica.
      const date = new Date(Date.now() + (days + 6) * 86_400_000).toISOString().slice(0, 10);
      return send(res, 200, `${date}T00:00:00`);
    }

    if (method === "POST" && path === "/api/patient") {
      if (!body || typeof body !== "object") return send(res, 400, springError(400, "Bad Request", "Required request body is missing", path));
      const id = nextPatientId++;
      const sent = body as Json;
      const stored: Json = { ...PATIENT_RESPONSE, ...sent, id, signupDate: serverNow(), user: SHARED_USER, creator: SHARED_USER, diagnosis: [] };
      delete stored.userId;
      replica.patients.set(id, stored);
      return send(res, 200, stored);
    }
    const patientMatch = /^\/api\/patient\/(\d+)$/.exec(path);
    if (method === "GET" && patientMatch) {
      const stored = replica.patients.get(Number(patientMatch[1]));
      return stored ? send(res, 200, stored) : send(res, 404, springError(404, "Not Found", "Patient not found", path));
    }

    if (method === "POST" && path === "/api/treatments") {
      if (!contentType?.startsWith("multipart/form-data")) {
        return send(res, 415, springError(415, "Unsupported Media Type", `Content type '${contentType ?? ""}' not supported`, path));
      }
      if (multipartDto === null) {
        return send(res, 400, springError(400, "Bad Request", "Required request part 'treatmentDTO' is not present", path));
      }
      const dto = body as Json;
      const patient = replica.patients.get(Number(dto.patientId));
      if (!patient) return send(res, 400, springError(400, "Bad Request", "Patient not found", path));

      const id = nextTreatmentId++;
      const stored: Json = { ...TREATMENT_RESPONSE };
      for (const [key, value] of Object.entries(dto)) {
        if (key in TREATMENT_RESPONSE && !SERVER_OWNED_KEYS.has(key)) stored[key] = value;
      }
      const sentAddress = (dto.deliveryAddress ?? {}) as Json;
      const upper = (v: unknown) => (typeof v === "string" ? v.toUpperCase() : v);
      Object.assign(stored, {
        id,
        statusId: 1,
        requestDate: serverNow(),
        lastActivity: serverNow(),
        patient,
        deliveryAddress: { ...sentAddress, name: upper(sentAddress.name), address: upper(sentAddress.address), city: upper(sentAddress.city) },
        total: dto.morningAligner === true ? 607 : 459,
      });
      replica.treatments.set(id, stored);
      return send(res, 200, stored);
    }
    // Spring page of the patient's full treatment DTOs, as read live on 2026-10-03.
    const byPatientMatch = /^\/api\/treatments\/byPatient\/(\d+)$/.exec(path);
    if (method === "GET" && byPatientMatch) {
      const patientId = Number(byPatientMatch[1]);
      const page = Number(url.searchParams.get("page") ?? "0");
      const size = Number(url.searchParams.get("size") ?? "20");
      // The create response carries `patient` as an object; the list DTO (like GET /DTO/:id) also has patientId.
      const all = [...replica.treatments.values()]
        .filter((t) => Number((t.patient as Json | undefined)?.id) === patientId)
        .map((t) => ({ ...t, patientId }));
      const content = all.slice(page * size, page * size + size);
      const totalPages = Math.ceil(all.length / size);
      return send(res, 200, {
        content,
        totalElements: all.length,
        totalPages,
        size,
        number: page,
        numberOfElements: content.length,
        first: page === 0,
        last: page + 1 >= totalPages,
        empty: content.length === 0,
      });
    }

    // The account's order list: a Spring page of full DTOs, newest first (read live on 2026-10-03, NEO-218).
    if (method === "GET" && path === "/api/treatments/DTO") {
      if (!url.searchParams.has("treatmentSearchForm")) {
        return send(res, 400, springError(400, "Bad Request", "Required request parameter 'treatmentSearchForm' is not present", path));
      }
      const page = Number(url.searchParams.get("page") ?? "0");
      const size = Number(url.searchParams.get("size") ?? "20");
      const all = [...replica.treatments.values()]
        .map((t): Json => ({ ...t, patientId: Number((t.patient as Json | undefined)?.id ?? t.patientId) }))
        .sort((a, b) => Number(b.id) - Number(a.id));
      const content = all.slice(page * size, page * size + size);
      const totalPages = Math.ceil(all.length / size);
      return send(res, 200, {
        content,
        totalElements: all.length,
        totalPages,
        size,
        number: page,
        numberOfElements: content.length,
        first: page === 0,
        last: page + 1 >= totalPages,
        empty: content.length === 0,
      });
    }

    const treatmentMatch = /^\/api\/treatments\/DTO\/(\d+)$/.exec(path);
    if (method === "GET" && treatmentMatch) {
      const stored = replica.treatments.get(Number(treatmentMatch[1]));
      return stored ? send(res, 200, stored) : send(res, 404, springError(404, "Not Found", "Treatment not found", path));
    }

    if (method === "POST" && path === "/api/notifications") {
      const sent = (body ?? {}) as Json;
      return send(res, 200, { ...sent, id: 591960 + replica.requests.length, creationDate: serverNow(), emailed: true });
    }

    return send(res, 404, springError(404, "Not Found", "No message available", path));
  }

  const server: Server = createServer((req, res) => {
    // A client that aborts (e.g. the real FETCH_TIMEOUT_MS firing in
    // orthoapnea.ts, NEO-210's timeout spec) closes the socket while this
    // handler is still mid-delay/mid-write — without this listener, writing
    // to the now-dead response emits an unhandled 'error' that crashes the
    // whole test process instead of just failing the one write.
    res.on("error", () => {});
    handle(req, res).catch((err: unknown) => {
      if (!res.headersSent) send(res, 500, springError(500, "Internal Server Error", String(err), req.url ?? ""));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  replica.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  replica.close = () =>
    new Promise<void>((resolve, reject) => {
      server.closeAllConnections();
      server.close((err) => (err ? reject(err) : resolve()));
    });
  return replica;
}
