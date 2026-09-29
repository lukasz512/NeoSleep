import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Connection-resilience contract tests: the service talks real HTTP (real
 * global fetch, real sockets) to a local fake apneadock.es that reproduces
 * the production behaviour we've verified by hand — Basic-auth login
 * returning a JWT, and 403 (not 401) for an invalid/revoked token. Nothing
 * here touches the real OrthoApnea server; the live check is the opt-in
 * `pnpm --filter @neo/api oa:smoke` script (exactly one login + one read).
 */

const EMAIL = "neosleep@example.com";
const PASSWORD = "correct-horse";

interface FakeOrthoApnea {
  baseUrl: string;
  loginCalls: number;
  /** Tokens the fake currently accepts; clearing it simulates OrthoApnea revoking every issued session. */
  validTokens: Set<string>;
  mode: "ok" | "hang" | "server_error";
  /** Range header the video endpoint last received. */
  lastRange: string | null;
  close: () => Promise<void>;
}

const VIDEO_BYTES = Buffer.from("0123456789abcdef");

function jwt(expiresInSeconds: number, nonce: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds, n: nonce })).toString(
    "base64url"
  );
  return `header.${payload}.signature`;
}

async function startFakeOrthoApnea(): Promise<FakeOrthoApnea> {
  const hanging: ServerResponse[] = [];
  const fake: FakeOrthoApnea = {
    baseUrl: "",
    loginCalls: 0,
    validTokens: new Set(),
    mode: "ok",
    lastRange: null,
    close: async () => {},
  };

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const auth = req.headers.authorization ?? "";
    if (req.method === "POST" && req.url === "/api/login") {
      fake.loginCalls += 1;
      if (fake.mode === "hang") {
        hanging.push(res);
        return;
      }
      if (fake.mode === "server_error") {
        res.writeHead(503).end();
        return;
      }
      const expected = `Basic ${Buffer.from(`${EMAIL}:${PASSWORD}`).toString("base64")}`;
      if (auth !== expected) {
        res.writeHead(401).end();
        return;
      }
      const token = jwt(12 * 3600, fake.loginCalls);
      fake.validTokens.add(token);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ token, roles: [{ authority: "ROLE_DOCTOR" }], userId: 1 }));
      return;
    }
    if (req.method === "GET" && req.url === "/api/resources") {
      const token = auth.replace(/^Bearer /, "");
      // Production answers an unknown/expired JWT with 403 — verified 2026-09-25.
      if (!fake.validTokens.has(token)) {
        res.writeHead(403).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify([
          { id: 1, type: 1, category: 1, weight: 1, deleted: false, titleEs: "Guía", urlEs: "a.pdf" },
          { id: 26, type: 2, category: 1, weight: 2, deleted: false, titleEs: "Webinar", urlEs: "Introducción.mp4" },
        ])
      );
      return;
    }
    if (req.method === "GET" && req.url === `/media/video/tutorials/${encodeURIComponent("Introducción.mp4")}`) {
      if (!fake.validTokens.has(auth.replace(/^Bearer /, ""))) {
        res.writeHead(403).end();
        return;
      }
      fake.lastRange = req.headers.range ?? null;
      // Same shape apneadock.es answers with for Range (verified 2026-09-25).
      const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? "");
      if (match) {
        const [start, end] = [Number(match[1]), Math.min(Number(match[2]), VIDEO_BYTES.length - 1)];
        res.writeHead(206, {
          "Content-Type": "video/mp4",
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${VIDEO_BYTES.length}`,
          "Accept-Ranges": "bytes",
        });
        res.end(VIDEO_BYTES.subarray(start, end + 1));
        return;
      }
      res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": String(VIDEO_BYTES.length) });
      res.end(VIDEO_BYTES);
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  fake.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () =>
    new Promise<void>((resolve) => {
      for (const res of hanging) res.destroy();
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return fake;
}

async function importService(fake: FakeOrthoApnea, password = PASSWORD) {
  vi.doMock("../../env.js", () => ({
    ORTHOAPNEA_BASE_URL: fake.baseUrl,
    ORTHOAPNEA_EMAIL: EMAIL,
    ORTHOAPNEA_PASSWORD: password,
  }));
  vi.resetModules();
  return import("./orthoapnea.js");
}

let fake: FakeOrthoApnea;

beforeEach(async () => {
  fake = await startFakeOrthoApnea();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock("../../env.js");
  await fake.close();
});

describe("OrthoApnea connection resilience (fake apneadock.es over real HTTP)", () => {
  it("connects and reads resources with valid credentials", async () => {
    const { checkConnection, fetchResources } = await importService(fake);
    expect(await checkConnection()).toEqual({ connected: true, attemptsExhausted: false });
    const items = await fetchResources("es");
    expect(items).toHaveLength(2);
    expect(fake.loginCalls).toBe(1);
  });

  it("re-logs in once and recovers when OrthoApnea revokes the cached token (403, not 401)", async () => {
    const { checkConnection, fetchResources } = await importService(fake);
    await checkConnection();
    fake.validTokens.clear(); // e.g. OrthoApnea restarted or rotated its signing key

    const items = await fetchResources("es");
    expect(items).toHaveLength(2);
    expect(fake.loginCalls).toBe(2);
  });

  it("reports credentials_rejected when this server's password is wrong", async () => {
    const { checkConnection } = await importService(fake, "stale-password");
    expect(await checkConnection()).toEqual({
      connected: false,
      attemptsExhausted: false,
      reason: "credentials_rejected",
    });
  });

  it("reports unexpected_response when OrthoApnea itself errors", async () => {
    fake.mode = "server_error";
    const { checkConnection } = await importService(fake);
    expect((await checkConnection()).reason).toBe("unexpected_response");
  });

  it("reports unreachable when OrthoApnea can't be reached at all", async () => {
    const { checkConnection } = await importService(fake);
    await fake.close();
    expect((await checkConnection()).reason).toBe("unreachable");
  });

  it("times out a hung login instead of staying disconnected forever, then recovers", async () => {
    fake.mode = "hang";
    const { checkConnection } = await importService(fake);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

    const pending = checkConnection();
    await vi.advanceTimersByTimeAsync(20_001);
    expect(await pending).toEqual({ connected: false, attemptsExhausted: false, reason: "timeout" });

    // Past the reconnect cooldown, a healthy OrthoApnea must be picked up again.
    fake.mode = "ok";
    await vi.advanceTimersByTimeAsync(16_000);
    expect(await checkConnection()).toEqual({ connected: true, attemptsExhausted: false });
  });

  it("does not hammer OrthoApnea: repeated checks during the cooldown make no extra login calls", async () => {
    const { checkConnection } = await importService(fake, "stale-password");
    for (let i = 0; i < 10; i++) await checkConnection();
    expect(fake.loginCalls).toBe(1);
  });
});

describe("OrthoApnea webinar streaming (fake apneadock.es over real HTTP)", () => {
  async function readAll(body: ReadableStream<Uint8Array>): Promise<string> {
    return Buffer.from(await new Response(body).arrayBuffer()).toString();
  }

  it("forwards the player's Range and passes back 206 + Content-Range, so Safari can play and seek", async () => {
    const { fetchResourceMedia } = await importService(fake);
    const media = await fetchResourceMedia("26", "es", undefined, "bytes=4-7");

    expect(fake.lastRange).toBe("bytes=4-7");
    expect(media.status).toBe(206);
    expect(media.headers["content-range"]).toBe("bytes 4-7/16");
    expect(media.headers["content-type"]).toBe("video/mp4");
    expect(await readAll(media.body)).toBe("4567");
  });

  it("streams the whole file with 200 when no Range is sent", async () => {
    const { fetchResourceMedia } = await importService(fake);
    const media = await fetchResourceMedia("26", "es");
    expect(media.status).toBe(200);
    expect(await readAll(media.body)).toBe("0123456789abcdef");
  });
});

describe("Cloud Run response cap (32 MiB): never ask OrthoApnea for the whole webinar", () => {
  it("turns Chrome's opening `bytes=0-` into one bounded slice", async () => {
    const { fetchResourceMedia, MAX_MEDIA_SLICE_BYTES } = await importService(fake);
    const media = await fetchResourceMedia("26", "es", undefined, "bytes=0-");
    expect(fake.lastRange).toBe(`bytes=0-${MAX_MEDIA_SLICE_BYTES - 1}`);
    expect(media.status).toBe(206);
  });

  it("boundedRange caps open, oversized and suffix ranges, and leaves small ones alone", async () => {
    const { boundedRange, MAX_MEDIA_SLICE_BYTES: max } = await importService(fake);
    expect(boundedRange("bytes=100-")).toBe(`bytes=100-${100 + max - 1}`);
    expect(boundedRange("bytes=0-580428530")).toBe(`bytes=0-${max - 1}`);
    expect(boundedRange("bytes=290000000-290000001")).toBe("bytes=290000000-290000001");
    expect(boundedRange("bytes=-999999999")).toBe(`bytes=-${max}`);
    expect(boundedRange(undefined)).toBeUndefined();
  });
});
