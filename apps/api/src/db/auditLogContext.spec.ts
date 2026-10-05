import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { requestIdMiddleware } from "../middleware/requestId.js";
import { requestContextMiddleware } from "../context/requestContext.js";
import { withTenant } from "./tenant.js";
import { insertAuditLog, auditRetainUntil, auditIp, getAuditLogForEntities, type AuditLogInsert } from "./audit-log.js";

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

interface StoredContext {
  request_id: string | null;
  user_ip: string | null;
  user_agent: string | null;
  jurisdiction: string | null;
  retain_until: Date | null;
}

async function stored(entityId: string): Promise<StoredContext | undefined> {
  return withTenant(TENANT_SLUG, async (client) =>
    (
      await client.query<StoredContext>(
        `SELECT request_id, host(user_ip) AS user_ip, user_agent, jurisdiction, retain_until FROM audit_log WHERE entity_id = $1`,
        [entityId],
      )
    ).rows[0],
  );
}

/** An app whose only route writes one audit row as an actor from `country`. */
function appWritingAudit(row: AuditLogInsert, country?: string): express.Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.post("/write", async (req, res) => {
    // requireAuth sets req.user per route, after the context was entered.
    if (country) req.user = { sub: "u", email: "qa@neosleepcare.com", role: "admin", country_code: country, tokenVersion: 0, iat: 0, exp: 0 };
    await withTenant(TENANT_SLUG, (client) => insertAuditLog(client, row));
    res.status(204).end();
  });
  return app;
}

function yearsFromNow(date: Date | null): number {
  return Math.round(((date?.getTime() ?? 0) - Date.now()) / (365.25 * 24 * 3600 * 1000));
}

describe("auditRetainUntil (audit-context-r1 D1)", () => {
  const at = new Date("2026-10-05T12:00:00Z");

  it("keeps a read 2 years whatever the country", () => {
    expect(auditRetainUntil("read", "PL", at).toISOString()).toBe("2028-10-05T12:00:00.000Z");
    expect(auditRetainUntil("read", null, at).toISOString()).toBe("2028-10-05T12:00:00.000Z");
  });

  it("keeps a change as long as the medical record: PL 20 years, MX 5, unknown 20", () => {
    expect(auditRetainUntil("update", "PL", at).toISOString()).toBe("2046-10-05T12:00:00.000Z");
    expect(auditRetainUntil("notify", "MX", at).toISOString()).toBe("2031-10-05T12:00:00.000Z");
    expect(auditRetainUntil("create", null, at).toISOString()).toBe("2046-10-05T12:00:00.000Z");
    expect(auditRetainUntil("create", "TH", at).toISOString()).toBe("2046-10-05T12:00:00.000Z");
  });
});

describe("auditIp (audit-context-r1 D4)", () => {
  it("keeps the full IP on a change", () => {
    expect(auditIp("update", "203.0.113.7")).toBe("203.0.113.7");
    expect(auditIp("update", "2001:db8:1:2::5")).toBe("2001:db8:1:2::5");
  });

  it("truncates a read to the network: IPv4 /24, IPv6 /48", () => {
    expect(auditIp("read", "203.0.113.7")).toBe("203.0.113.0");
    expect(auditIp("read", "2001:db8:1:2::5")).toBe("2001:db8:1::");
    expect(auditIp("read", "2001:db8::5")).toBe("2001:db8:0::");
    expect(auditIp("read", "::1")).toBe("0:0:0::");
  });

  it("unwraps an IPv4-mapped IPv6 address", () => {
    expect(auditIp("update", "::ffff:198.51.100.9")).toBe("198.51.100.9");
    expect(auditIp("read", "::ffff:198.51.100.9")).toBe("198.51.100.0");
  });

  it("drops anything that isn't an IP, so the inet insert can't fail", () => {
    expect(auditIp("update", "not-an-ip")).toBeNull();
    expect(auditIp("update", "")).toBeNull();
    expect(auditIp("update", null)).toBeNull();
    expect(auditIp("update", undefined)).toBeNull();
  });
});

describe("insertAuditLog request context (real DB)", () => {
  it("fills request id, IP, user agent, country and retention from the request", async () => {
    const entityId = randomUUID();
    const res = await request(appWritingAudit({ action: "update", entity_type: "Patient", entity_id: entityId }, "MX"))
      .post("/write")
      .set("X-Request-ID", `req-audit-${entityId}`)
      .set("X-Forwarded-For", "203.0.113.7")
      .set("User-Agent", "Vitest/1.0");
    expect(res.status).toBe(204);

    const row = await stored(entityId);
    expect(row).toMatchObject({ request_id: `req-audit-${entityId}`, user_ip: "203.0.113.7", user_agent: "Vitest/1.0", jurisdiction: "MX" });
    expect(yearsFromNow(row!.retain_until)).toBe(5);
  });

  it("truncates the IP and keeps 2 years on a read", async () => {
    const entityId = randomUUID();
    await request(appWritingAudit({ action: "read", entity_type: "Patient", entity_id: entityId }, "PL"))
      .post("/write")
      .set("X-Forwarded-For", "203.0.113.7");

    const row = await stored(entityId);
    expect(row).toMatchObject({ user_ip: "203.0.113.0", jurisdiction: "PL" });
    expect(yearsFromNow(row!.retain_until)).toBe(2);
  });

  it("values the caller passes win over the request", async () => {
    const entityId = randomUUID();
    const retainUntil = new Date("2030-01-01T00:00:00Z");
    await request(
      appWritingAudit(
        {
          action: "update",
          entity_type: "Patient",
          entity_id: entityId,
          request_id: "explicit-req",
          user_ip: "198.51.100.1",
          user_agent: "Explicit/1.0",
          jurisdiction: "PL",
          retain_until: retainUntil,
        },
        "MX",
      ),
    )
      .post("/write")
      .set("X-Request-ID", "context-req")
      .set("X-Forwarded-For", "203.0.113.7")
      .set("User-Agent", "Vitest/1.0");

    const row = await stored(entityId);
    expect(row).toMatchObject({ request_id: "explicit-req", user_ip: "198.51.100.1", user_agent: "Explicit/1.0", jurisdiction: "PL" });
    expect(row!.retain_until?.toISOString()).toBe(retainUntil.toISOString());
  });

  it("outside a request (background job) the row has no request context, and the longest retention", async () => {
    const entityId = randomUUID();
    await withTenant(TENANT_SLUG, (client) => insertAuditLog(client, { action: "update", entity_type: "TreatmentPlan", entity_id: entityId }));

    const row = await stored(entityId);
    expect(row).toMatchObject({ request_id: null, user_ip: null, user_agent: null, jurisdiction: null });
    expect(yearsFromNow(row!.retain_until)).toBe(20);
  });
});

describe("legacy 'Person' audit rows (audit-context-r1 D3)", () => {
  it("are read back as 'User' without rewriting the stored row", async () => {
    const entityId = randomUUID();
    await withTenant(TENANT_SLUG, async (client) => {
      await insertAuditLog(client, { action: "update", entity_type: "Person", entity_id: entityId });
      const [entry] = await getAuditLogForEntities(client, ["Person"], [entityId]);
      expect(entry?.entity_type).toBe("User");
      const raw = await client.query<{ entity_type: string }>(`SELECT entity_type FROM audit_log WHERE entity_id = $1`, [entityId]);
      expect(raw.rows[0]?.entity_type).toBe("Person");
    });
  });
});
