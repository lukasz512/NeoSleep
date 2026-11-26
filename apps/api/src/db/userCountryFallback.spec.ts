import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, getUserById } from "../db.js";

// Integration test (real tenant DB) for NEO-226: a user whose identity has no
// country_code but sits in a territory takes that territory's country — the
// PWA defaults the phone area code and a new patient's country from it.
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("users.country_code fallback to the user's own territory", () => {
  it("uses the identity's country_code first, the territory's when it is empty", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
      const user = await insertStaffUser(client, `qa-country-${uniqueSuffix()}@neosleepcare.com`, "QA", "Country", "admin", hash, false);
      const territory = await client.query<{ id: string; country_code: string }>(
        `SELECT id, country_code FROM territory WHERE country_code <> 'PL' ORDER BY created_at LIMIT 1`,
      );
      expect(territory.rows.length).toBe(1);
      const { id: territoryId, country_code: territoryCountry } = territory.rows[0];

      await client.query(
        `UPDATE identities SET country_code = NULL, territory_id = $1 WHERE id = (SELECT identity_id FROM users WHERE id = $2)`,
        [territoryId, user!.id],
      );
      expect((await getUserById(client, user!.id))?.country_code).toBe(territoryCountry);

      await client.query(
        `UPDATE identities SET country_code = 'PL' WHERE id = (SELECT identity_id FROM users WHERE id = $1)`,
        [user!.id],
      );
      expect((await getUserById(client, user!.id))?.country_code).toBe("PL");
    });
  });
});
