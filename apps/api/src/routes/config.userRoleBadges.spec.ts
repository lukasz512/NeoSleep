import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";

// CORE-114: GET /config/app serves the tenant's role → avatar badge icon
// overrides from app_config.metadata.userRoleBadges. Real DB, no mocks.
const { app } = await import("../server.js");
const { withTenant } = await import("../db.js");

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

// The isolated "test" schema is cloned without data, so the config row this
// spec needs may not exist; it creates one and removes only what it created.
let createdRow = false;

async function setMetadata(metadata: unknown): Promise<void> {
  await withTenant(TENANT_SLUG, async (client) => {
    const value = metadata === null ? null : JSON.stringify(metadata);
    const updated = await client.query(
      `UPDATE app_config SET metadata = $1::jsonb WHERE id = (SELECT id FROM app_config LIMIT 1)`,
      [value],
    );
    if (updated.rowCount === 0) {
      await client.query(`INSERT INTO app_config (metadata) VALUES ($1::jsonb)`, [value]);
      createdRow = true;
    }
  });
}

describe("GET /config/app user_role_badges (CORE-114)", () => {
  afterEach(async () => {
    if (createdRow) {
      await withTenant(TENANT_SLUG, (client) => client.query(`DELETE FROM app_config`));
      createdRow = false;
    } else {
      await setMetadata(null);
    }
  });

  it("is an empty map when the tenant has no overrides", async () => {
    await setMetadata(null);
    const res = await request(app).get("/api/v1/config/app");
    expect(res.status).toBe(200);
    expect(res.body.user_role_badges).toEqual({});
  });

  it("passes the tenant's overrides through, keeping only string values", async () => {
    await setMetadata({ other: true, userRoleBadges: { manager: "users-group", rep: 7, kam: null } });
    const res = await request(app).get("/api/v1/config/app");
    expect(res.status).toBe(200);
    expect(res.body.user_role_badges).toEqual({ manager: "users-group" });
  });
});
